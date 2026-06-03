// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { editMessageSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import type { MessageDto } from '@/app/api/channels/[channelId]/messages/route'

declare global {
  var __cairnMockMessageStore: Map<string, MessageDto[]> | undefined
}

type RouteContext = { params: Promise<{ messageId: string }> }

export async function PATCH(req: Request, { params }: RouteContext) {
  const { messageId } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = editMessageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  if (!process.env['DATABASE_URL']) {
    const store = globalThis.__cairnMockMessageStore
    if (store) {
      for (const [channelId, msgs] of store.entries()) {
        const idx = msgs.findIndex(m => m.id === messageId)
        if (idx !== -1) {
          const msg = msgs[idx]!
          if (msg.senderId !== ctx.userId) {
            return NextResponse.json({ error: '編集権限がありません' }, { status: 403 })
          }
          msgs[idx] = { ...msg, content: parsed.data.content, isEdited: true }
          store.set(channelId, msgs)
          return NextResponse.json(msgs[idx])
        }
      }
    }
    return NextResponse.json({ error: 'メッセージが見つかりません' }, { status: 404 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { messages, channels } = await import('@cairn/db')
    const { eq, and, isNull } = await import('drizzle-orm')

    // 送信者・ワークスペース・削除済み除外をすべて確認してから更新
    const [target] = await db
      .select({ id: messages.id })
      .from(messages)
      .innerJoin(channels, eq(messages.channelId, channels.id))
      .where(and(
        eq(messages.id, messageId),
        eq(messages.senderId, ctx.userId),
        eq(channels.workspaceId, ctx.workspaceId),
        isNull(messages.deletedAt),
      ))
      .limit(1)

    if (!target) {
      return NextResponse.json({ error: 'メッセージが見つからないか編集権限がありません' }, { status: 404 })
    }

    const [updated] = await db
      .update(messages)
      .set({ content: parsed.data.content, isEdited: true, updatedAt: new Date() })
      .where(eq(messages.id, messageId))
      .returning({ id: messages.id, content: messages.content })

    return NextResponse.json({ id: updated!.id, content: updated!.content })
  } catch (err) {
    console.error('[/api/messages/[messageId] PATCH] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { messageId } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  if (!process.env['DATABASE_URL']) {
    const store = globalThis.__cairnMockMessageStore
    if (store) {
      for (const [channelId, msgs] of store.entries()) {
        const idx = msgs.findIndex(m => m.id === messageId)
        if (idx !== -1) {
          const msg = msgs[idx]!
          if (msg.senderId !== ctx.userId) {
            return NextResponse.json({ error: '削除権限がありません' }, { status: 403 })
          }
          store.set(channelId, msgs.filter(m => m.id !== messageId))
          return new NextResponse(null, { status: 204 })
        }
      }
    }
    return NextResponse.json({ error: 'メッセージが見つかりません' }, { status: 404 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { messages, channels } = await import('@cairn/db')
    const { eq, and, isNull } = await import('drizzle-orm')

    // 送信者・ワークスペーススコープを確認してからソフトデリート
    const [target] = await db
      .select({ id: messages.id })
      .from(messages)
      .innerJoin(channels, eq(messages.channelId, channels.id))
      .where(and(
        eq(messages.id, messageId),
        eq(messages.senderId, ctx.userId),
        eq(channels.workspaceId, ctx.workspaceId),
        isNull(messages.deletedAt),
      ))
      .limit(1)

    if (!target) {
      return NextResponse.json({ error: 'メッセージが見つからないか削除権限がありません' }, { status: 404 })
    }

    await db
      .update(messages)
      .set({ deletedAt: new Date() })
      .where(eq(messages.id, messageId))

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[/api/messages/[messageId] DELETE] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
