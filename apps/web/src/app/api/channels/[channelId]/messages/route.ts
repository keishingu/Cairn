// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { postMessageSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'

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
  createdAt: string
  reactions: ReactionDto[]
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
    const { messages, profiles, messageReactions } = await import('@cairn/db')
    const { eq, isNull, inArray, and } = await import('drizzle-orm')

    const { desc } = await import('drizzle-orm')

    const rows = await db
      .select({
        id: messages.id,
        content: messages.content,
        senderId: messages.senderId,
        senderName: profiles.displayName,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(profiles, eq(messages.senderId, profiles.id))
      .where(and(eq(messages.channelId, channelId), isNull(messages.deletedAt)))
      .orderBy(desc(messages.createdAt))
      .limit(100)

    rows.reverse()

    const messageIds = rows.map(r => r.id)
    const reactionRows = messageIds.length > 0
      ? await db
          .select({
            messageId: messageReactions.messageId,
            emoji: messageReactions.emoji,
            userId: messageReactions.userId,
          })
          .from(messageReactions)
          .where(inArray(messageReactions.messageId, messageIds))
      : []

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

    const result: MessageDto[] = rows.map(r => ({
      id: r.id,
      content: r.content,
      senderId: r.senderId,
      senderName: r.senderName,
      createdAt: r.createdAt.toISOString(),
      reactions: reactionMap.get(r.id) ?? [],
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
      createdAt: new Date().toISOString(),
      reactions: [],
    }
    const mockStore = getMockStore()
    const prev = mockStore.get(channelId) ?? []
    mockStore.set(channelId, [...prev, newMsg])
    return NextResponse.json(newMsg, { status: 201 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { messages, profiles } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const [inserted] = await db
      .insert(messages)
      .values({
        channelId,
        senderId: ctx.userId,
        content: parsed.data.content,
        messageType: parsed.data.messageType ?? 'text',
        parentMessageId: parsed.data.parentMessageId ?? null,
      })
      .returning({ id: messages.id, content: messages.content, senderId: messages.senderId, createdAt: messages.createdAt })

    if (!inserted) throw new Error('Insert returned no rows')

    const [profile] = await db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, inserted.senderId))

    return NextResponse.json({
      id: inserted.id,
      content: inserted.content,
      senderId: inserted.senderId,
      senderName: profile?.displayName ?? '不明',
      createdAt: inserted.createdAt.toISOString(),
      reactions: [],
    } satisfies MessageDto, { status: 201 })
  } catch (err) {
    console.error('[/api/channels/[channelId]/messages POST] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
