// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

type RouteContext = { params: Promise<{ messageId: string }> }

// メッセージの個人ブックマークをトグルする
export async function POST(_req: Request, { params }: RouteContext) {
  const { messageId } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  try {
    const { db, messageBookmarks, messages, channels, channelMembers } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')

    // 閲覧権限のないメッセージをブックマークできないよう、対象メッセージの可視性を確認する。
    // ワークスペース外、または未参加のプライベートチャンネルは存在を秘匿して 404 を返す
    const [msg] = await db
      .select({ channelId: channels.id, isPrivate: channels.isPrivate, workspaceId: channels.workspaceId })
      .from(messages)
      .innerJoin(channels, eq(messages.channelId, channels.id))
      .where(eq(messages.id, messageId))
      .limit(1)

    if (!msg || msg.workspaceId !== ctx.workspaceId) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    if (msg.isPrivate) {
      const [membership] = await db
        .select({ userId: channelMembers.userId })
        .from(channelMembers)
        .where(and(eq(channelMembers.channelId, msg.channelId), eq(channelMembers.userId, ctx.userId)))
        .limit(1)
      if (!membership) {
        return NextResponse.json({ error: 'Message not found' }, { status: 404 })
      }
    }

    const [existing] = await db
      .select({ id: messageBookmarks.id })
      .from(messageBookmarks)
      .where(and(eq(messageBookmarks.messageId, messageId), eq(messageBookmarks.userId, ctx.userId)))

    if (existing) {
      await db.delete(messageBookmarks).where(eq(messageBookmarks.id, existing.id))
      return NextResponse.json({ bookmarked: false })
    }

    await db.insert(messageBookmarks).values({ messageId, userId: ctx.userId })
    return NextResponse.json({ bookmarked: true })
  } catch (err) {
    console.error('[/api/messages/[messageId]/bookmark POST] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
