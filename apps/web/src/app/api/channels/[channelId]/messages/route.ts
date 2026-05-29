// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { type AttachmentDto, postMessageSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { inngest } from '@/lib/inngest/client'
import type { MessageCreatedEvent } from '@/lib/inngest/events'

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
  reactions: ReactionDto[]
  attachments: AttachmentDto[]
}

declare global {
  var __cairnMockMessageStore: Map<string, MessageDto[]> | undefined
}

function getMockStore() {
  globalThis.__cairnMockMessageStore ??= new Map<string, MessageDto[]>()
  return globalThis.__cairnMockMessageStore
}

type RouteContext = { params: Promise<{ channelId: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const { channelId } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json(getMockStore().get(channelId) ?? [] satisfies MessageDto[])
  }

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
        senderGlobalAvatarUrl: profiles.avatarUrl,
        senderWorkspaceAvatarUrl: workspaceMembers.avatarUrl,
        createdAt: messages.createdAt,
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
      senderAvatarUrl: r.senderWorkspaceAvatarUrl ?? r.senderGlobalAvatarUrl,
      createdAt: r.createdAt.toISOString(),
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

  if (!process.env['DATABASE_URL']) {
    const newMsg: MessageDto = {
      id: crypto.randomUUID(),
      content: parsed.data.content,
      senderId: ctx.userId,
      senderName: '山田 太郎',
      senderAvatarUrl: null,
      createdAt: new Date().toISOString(),
      reactions: [],
      attachments: [],
    }
    const mockStore = getMockStore()
    const prev = mockStore.get(channelId) ?? []
    mockStore.set(channelId, [...prev, newMsg])
    return NextResponse.json(newMsg, { status: 201 })
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
        globalAvatarUrl: profiles.avatarUrl,
        workspaceAvatarUrl: workspaceMembers.avatarUrl,
      })
      .from(profiles)
      .leftJoin(
        workspaceMembers,
        and2(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.workspaceId, ctx.workspaceId)),
      )
      .where(eq(profiles.id, inserted.senderId))

    const senderName = profile?.displayName ?? '不明'

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
      senderAvatarUrl: profile?.workspaceAvatarUrl ?? profile?.globalAvatarUrl ?? null,
      createdAt: inserted.createdAt.toISOString(),
      reactions: [],
      attachments: [],
    } satisfies MessageDto, { status: 201 })
  } catch (err) {
    console.error('[/api/channels/[channelId]/messages POST] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
