// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto'
import type { MessageType } from '@cairn/shared'
import { channels, db, files, messageAttachments, messages, profiles, projects, workspaceMembers, workspaces } from '@cairn/db'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { inngest } from '@/lib/inngest/client'
import type { MessageCreatedEvent } from '@/lib/inngest/events'

const BOT_NAMESPACE = 'cairn-workspace-bot'

export interface PostBotMessageInput {
  workspaceId: string
  channelId: string
  content: string
  messageType?: MessageType
  parentMessageId?: string | null
  attachmentFileIds?: string[]
}

export interface BotProfileSummary {
  id: string
  displayName: string
}

function readMetadataChannelIds(meta: Record<string, unknown>): Set<string> {
  const ids = new Set<string>()
  const legacyChannelId = meta['channelId']
  if (typeof legacyChannelId === 'string') ids.add(legacyChannelId)
  const channelIds = meta['channelIds']
  if (Array.isArray(channelIds)) {
    for (const id of channelIds) {
      if (typeof id === 'string') ids.add(id)
    }
  }
  return ids
}

function formatUuidFromHex(hex: string): string {
  const body = hex.slice(0, 32).split('')
  body[12] = '5'
  body[16] = ((parseInt(body[16] ?? '0', 16) & 0x3) | 0x8).toString(16)
  return `${body.slice(0, 8).join('')}-${body.slice(8, 12).join('')}-${body.slice(12, 16).join('')}-${body.slice(16, 20).join('')}-${body.slice(20, 32).join('')}`
}

export function workspaceBotProfileId(workspaceId: string): string {
  return formatUuidFromHex(createHash('sha1').update(`${BOT_NAMESPACE}:${workspaceId}`).digest('hex'))
}

export async function ensureWorkspaceBotProfile(workspaceId: string): Promise<BotProfileSummary> {
  const [workspace] = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)

  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`)
  }

  const id = workspaceBotProfileId(workspaceId)
  const displayName = `${workspace.name} Bot`

  await db.transaction(async (tx) => {
    await tx
      .insert(profiles)
      .values({
        id,
        kind: 'bot',
        displayName,
      })
      .onConflictDoUpdate({
        target: profiles.id,
        set: { displayName },
      })

    await tx
      .insert(workspaceMembers)
      .values({
        workspaceId,
        userId: id,
        role: 'member',
        status: 'offline',
      })
      .onConflictDoNothing()
  })

  return { id, displayName }
}

async function assertBotPostTargets(workspaceId: string, channelId: string, attachmentFileIds: string[]) {
  const [channel] = await db
    .select({
      effectiveWorkspaceId: sql<string | null>`coalesce(${channels.workspaceId}, ${projects.workspaceId})`,
      projectId: channels.projectId,
    })
    .from(channels)
    .leftJoin(projects, eq(channels.projectId, projects.id))
    .where(eq(channels.id, channelId))
    .limit(1)

  if (!channel || channel.effectiveWorkspaceId !== workspaceId) {
    throw new Error('Bot post target channel does not belong to workspace')
  }

  if (attachmentFileIds.length === 0) {
    return
  }

  const attachmentRows = await db
    .select({
      id: files.id,
      workspaceId: files.workspaceId,
      projectId: files.projectId,
      fileType: files.fileType,
      storagePath: files.storagePath,
      metadata: files.metadata,
    })
    .from(files)
    .where(inArray(files.id, attachmentFileIds))
    .limit(attachmentFileIds.length)

  const attachmentMap = new Map(attachmentRows.map((row) => [row.id, row]))
  for (const fileId of attachmentFileIds) {
    const row = attachmentMap.get(fileId)
    if (!row || row.workspaceId !== workspaceId) {
      throw new Error('Bot post attachment does not belong to workspace')
    }

    const metadataChannelIds = readMetadataChannelIds((row.metadata ?? {}) as Record<string, unknown>)
    if (row.fileType === 'link' && metadataChannelIds.has(channelId)) {
      continue
    }

    const storageParts = row.storagePath?.split('/') ?? []
    const sourceChannelId = storageParts.length >= 3 && storageParts[0] === workspaceId ? storageParts[1] : null
    if (sourceChannelId === channelId) {
      continue
    }

    const [sharedIntoChannel] = await db
      .select({ messageId: messageAttachments.messageId })
      .from(messageAttachments)
      .innerJoin(messages, eq(messageAttachments.messageId, messages.id))
      .where(and(
        eq(messageAttachments.fileId, fileId),
        eq(messages.channelId, channelId),
      ))
      .limit(1)

    if (!sharedIntoChannel) {
      if (channel.projectId) {
        if (row.projectId !== channel.projectId) {
          throw new Error('Bot post attachment is not accessible from target project')
        }
        continue
      }

      if (row.projectId) {
        throw new Error('Bot post attachment is not accessible from target channel')
      }

      throw new Error('Bot post attachment is not accessible from target channel')
    } else {
      continue
    }
  }
}

async function assertBotReplyTarget(channelId: string, parentMessageId: string | null) {
  if (!parentMessageId) {
    return
  }

  const [parent] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(
      eq(messages.id, parentMessageId),
      eq(messages.channelId, channelId),
      isNull(messages.deletedAt),
    ))
    .limit(1)

  if (!parent) {
    throw new Error('Bot reply target message is not accessible from target channel')
  }
}

export async function postBotMessage(input: PostBotMessageInput) {
  const { workspaceId, channelId, content, messageType = 'text', parentMessageId = null, attachmentFileIds = [] } = input
  const bot = await ensureWorkspaceBotProfile(workspaceId)
  await assertBotPostTargets(workspaceId, channelId, attachmentFileIds)
  await assertBotReplyTarget(channelId, parentMessageId)

  const message = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(messages)
      .values({
        channelId,
        senderId: bot.id,
        messageType,
        content,
        parentMessageId,
      })
      .returning({
        id: messages.id,
        content: messages.content,
        senderId: messages.senderId,
        createdAt: messages.createdAt,
      })

    if (!inserted) {
      throw new Error('Bot message insert returned no rows')
    }

    if (attachmentFileIds.length > 0) {
      await tx
        .insert(messageAttachments)
        .values(
          attachmentFileIds.map((fileId, displayOrder) => ({
            messageId: inserted.id,
            fileId,
            displayOrder,
          })),
        )
    }

    return inserted
  })

  inngest.send({
    name: 'message/created',
    data: {
      messageId: message.id,
      channelId,
      workspaceId,
      senderId: bot.id,
      senderName: bot.displayName,
      content: message.content,
      attachmentFileIds,
    },
  } satisfies MessageCreatedEvent).catch((err: unknown) => {
    console.warn('[inngest] bot message/created send failed (Inngest not running?):', err)
  })

  return {
    id: message.id,
    content: message.content,
    messageType,
    senderId: bot.id,
    senderKind: 'bot' as const,
    senderName: bot.displayName,
    senderAvatarUrl: null,
    createdAt: message.createdAt.toISOString(),
    isEdited: false,
    reactions: [],
    attachments: [],
    parentMessageId,
    replyTo: null,
    bookmarked: false,
  }
}
