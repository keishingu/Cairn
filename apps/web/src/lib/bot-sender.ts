// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto'
import type { MessageType } from '@cairn/shared'
import { db, messageAttachments, messages, profiles, workspaceMembers, workspaces } from '@cairn/db'
import { eq } from 'drizzle-orm'
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
      .onConflictDoNothing()

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

export async function postBotMessage(input: PostBotMessageInput) {
  const { workspaceId, channelId, content, messageType = 'text', parentMessageId = null, attachmentFileIds = [] } = input
  const bot = await ensureWorkspaceBotProfile(workspaceId)

  const [message] = await db
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

  if (!message) {
    throw new Error('Bot message insert returned no rows')
  }

  if (attachmentFileIds.length > 0) {
    await db
      .insert(messageAttachments)
      .values(
        attachmentFileIds.map((fileId, displayOrder) => ({
          messageId: message.id,
          fileId,
          displayOrder,
        })),
      )
  }

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
