// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
import { runForActiveMembership } from '@/lib/access/active-membership-lock'

type RouteContext = { params: Promise<{ messageId: string }> }

// メッセージの個人ブックマークをトグルする
export async function POST(_req: Request, { params }: RouteContext) {
  const { messageId } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  try {
    const { db, messageBookmarks, messages, channels } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')

    // 閲覧権限のないメッセージをブックマークできないよう、対象メッセージの可視性を確認する。
    // DM は isPrivate=false でも channel_members 参加者限定のため、requireChannelAccess で
    // プライベート/DM/ゲストの判定をまとめて行う（個別実装すると DM の判定漏れにつながる）
    const [msg] = await db
      .select({ channelId: channels.id, workspaceId: channels.workspaceId })
      .from(messages)
      .innerJoin(channels, eq(messages.channelId, channels.id))
      .where(eq(messages.id, messageId))
      .limit(1)

    if (!msg || msg.workspaceId !== ctx.workspaceId) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, msg.channelId, ctx.role)
    if (forbidden) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    const bookmarked = await runForActiveMembership(
      db,
      ctx.workspaceId,
      ctx.userId,
      async tx => {
        const [existing] = await tx
          .select({ id: messageBookmarks.id })
          .from(messageBookmarks)
          .where(and(eq(messageBookmarks.messageId, messageId), eq(messageBookmarks.userId, ctx.userId)))

        if (existing) {
          await tx.delete(messageBookmarks).where(eq(messageBookmarks.id, existing.id))
          return false
        }

        await tx.insert(messageBookmarks).values({ messageId, userId: ctx.userId })
        return true
      },
    )

    if (bookmarked === null) {
      return NextResponse.json({ error: 'ワークスペースに所属していません' }, { status: 403 })
    }

    return NextResponse.json({ bookmarked })
  } catch (err) {
    console.error('[/api/messages/[messageId]/bookmark POST] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
