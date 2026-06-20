// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { type AttachmentDto, postMessageSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
import { inngest } from '@/lib/inngest/client'
import type { MessageCreatedEvent } from '@/lib/inngest/events'
import { parseCheckboxes } from '@/lib/chat/checkboxes'

export interface ReactionDto {
  emoji: string
  count: number
  mine: boolean
}

export interface MessageDto {
  id: string
  content: string
  senderId: string
  senderName: string
  senderAvatarUrl: string | null
  createdAt: string
  isEdited: boolean
  reactions: ReactionDto[]
  attachments: AttachmentDto[]
}

type RouteContext = { params: Promise<{ channelId: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const { channelId } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId)
  if (forbidden) return forbidden

  try {
    const { db } = await import('@cairn/db')
    const { messages, profiles, messageReactions, messageAttachments, files } = await import('@cairn/db')
    const { eq, isNull, inArray, and } = await import('drizzle-orm')
    const { desc } = await import('drizzle-orm')

    const { workspaceMembers } = await import('@cairn/db')

    const rows = await db
      .select({
        id: messages.id,
        content: messages.content,
        senderId: messages.senderId,
        senderName: profiles.displayName,
        senderAvatarUrl: workspaceMembers.avatarUrl,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
      })
      .from(messages)
      .innerJoin(profiles, eq(messages.senderId, profiles.id))
      .leftJoin(
        workspaceMembers,
        and(eq(workspaceMembers.userId, messages.senderId), eq(workspaceMembers.workspaceId, ctx.workspaceId)),
      )
      .where(and(eq(messages.channelId, channelId), isNull(messages.deletedAt)))
      .orderBy(desc(messages.createdAt))
      .limit(100)

    rows.reverse()

    const messageIds = rows.map(r => r.id)

    const [reactionRows, attachmentRows] = await Promise.all([
      messageIds.length > 0
        ? db
            .select({
              messageId: messageReactions.messageId,
              emoji: messageReactions.emoji,
              userId: messageReactions.userId,
            })
            .from(messageReactions)
            .where(inArray(messageReactions.messageId, messageIds))
        : Promise.resolve([]),
      messageIds.length > 0
        ? db
            .select({
              id: messageAttachments.id,
              messageId: messageAttachments.messageId,
              fileId: messageAttachments.fileId,
              displayOrder: messageAttachments.displayOrder,
              fileName: files.fileName,
              mimeType: files.mimeType,
              fileSize: files.fileSize,
            })
            .from(messageAttachments)
            .innerJoin(files, eq(messageAttachments.fileId, files.id))
            .where(inArray(messageAttachments.messageId, messageIds))
            .orderBy(messageAttachments.displayOrder)
        : Promise.resolve([]),
    ])

    const reactionMap = new Map<string, ReactionDto[]>()
    for (const r of reactionRows) {
      const key = `${r.messageId}:${r.emoji}`
      if (!reactionMap.has(r.messageId)) reactionMap.set(r.messageId, [])
      const existing = reactionMap.get(r.messageId)!.find(x => x.emoji === r.emoji)
      if (existing) {
        existing.count++
        if (r.userId === ctx.userId) existing.mine = true
      } else {
        reactionMap.get(r.messageId)!.push({ emoji: r.emoji, count: 1, mine: r.userId === ctx.userId })
      }
      void key
    }

    const attachmentMap = new Map<string, AttachmentDto[]>()
    for (const a of attachmentRows) {
      if (!attachmentMap.has(a.messageId)) attachmentMap.set(a.messageId, [])
      attachmentMap.get(a.messageId)!.push({
        id: a.id,
        fileId: a.fileId,
        fileName: a.fileName,
        mimeType: a.mimeType,
        fileSize: a.fileSize,
        displayOrder: a.displayOrder,
      })
    }

    const result: MessageDto[] = rows.map(r => ({
      id: r.id,
      content: r.content,
      senderId: r.senderId,
      senderName: r.senderName,
      senderAvatarUrl: r.senderAvatarUrl ?? null,
      createdAt: r.createdAt.toISOString(),
      isEdited: r.updatedAt.getTime() > r.createdAt.getTime(),
      reactions: reactionMap.get(r.id) ?? [],
      attachments: attachmentMap.get(r.id) ?? [],
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/channels/[channelId]/messages GET] DB query failed:', err)
    return NextResponse.json([] satisfies MessageDto[])
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  const { channelId } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId)
  if (forbidden) return forbidden

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = postMessageSchema.safeParse({ ...(body as object), channelId })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { messages, profiles, messageAttachments } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const attachmentFileIds = parsed.data.attachmentFileIds ?? []

    const inserted = await db.transaction(async (tx) => {
      const [msg] = await tx
        .insert(messages)
        .values({
          channelId,
          senderId: ctx.userId,
          content: parsed.data.content,
          messageType: parsed.data.messageType ?? 'text',
          parentMessageId: parsed.data.parentMessageId ?? null,
        })
        .returning({ id: messages.id, content: messages.content, senderId: messages.senderId, createdAt: messages.createdAt })

      if (!msg) throw new Error('Insert returned no rows')

      if (attachmentFileIds.length > 0) {
        await tx.insert(messageAttachments).values(
          attachmentFileIds.map((fileId, i) => ({
            messageId: msg.id,
            fileId,
            displayOrder: i,
          })),
        )
      }

      return msg
    })

    const { workspaceMembers } = await import('@cairn/db')
    const { and: and2 } = await import('drizzle-orm')

    const [profile] = await db
      .select({
        displayName: profiles.displayName,
        avatarUrl: workspaceMembers.avatarUrl,
      })
      .from(profiles)
      .leftJoin(
        workspaceMembers,
        and2(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.workspaceId, ctx.workspaceId)),
      )
      .where(eq(profiles.id, inserted.senderId))

    const senderName = profile?.displayName ?? '不明'

    // プロジェクトチャンネルの場合、- [ ] チェックボックスをタスクに自動変換
    const checkboxes = parseCheckboxes(inserted.content)
    if (checkboxes.length > 0) {
      const { channels, tasks } = await import('@cairn/db')
      const { eq: eq2 } = await import('drizzle-orm')
      const [channel] = await db
        .select({ projectId: channels.projectId })
        .from(channels)
        .where(eq2(channels.id, channelId))
        .limit(1)
      if (channel?.projectId) {
        const projectId = channel.projectId
        await db.insert(tasks).values(
          checkboxes.map(cb => ({
            projectId,
            title: cb.text,
            status: (cb.checked ? 'done' : 'todo') as 'done' | 'todo',
            priority: 'medium' as const,
            createdBy: ctx.userId,
            sourceMessageId: inserted.id,
            sourceCheckboxIndex: cb.index,
          })),
        )
      }
    }

    inngest.send({
      name: 'message/created',
      data: {
        messageId: inserted.id,
        channelId,
        workspaceId: ctx.workspaceId,
        senderId: ctx.userId,
        senderName,
        content: inserted.content,
        attachmentFileIds: parsed.data.attachmentFileIds ?? [],
      },
    } satisfies MessageCreatedEvent).catch((err: unknown) => {
      console.warn('[inngest] message/created send failed (Inngest not running?):', err)
    })

    return NextResponse.json({
      id: inserted.id,
      content: inserted.content,
      senderId: inserted.senderId,
      senderName,
      senderAvatarUrl: profile?.avatarUrl ?? null,
      createdAt: inserted.createdAt.toISOString(),
      isEdited: false,
      reactions: [],
      attachments: [],
    } satisfies MessageDto, { status: 201 })
  } catch (err) {
    console.error('[/api/channels/[channelId]/messages POST] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
