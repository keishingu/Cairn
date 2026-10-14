// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { canAccessChannel } from '@/lib/permissions'

type RouteContext = { params: Promise<{ messageId: string }> }

// メッセージが今どのチャンネルにあるかを返す。
// スレッドへ切り出されたメッセージの古いパーマリンクを、移動先へ辿り直すために使う。
// 閲覧できないチャンネルのメッセージは、存在の有無も分からないよう 404 にそろえる。
export async function GET(_req: Request, { params }: RouteContext) {
  const { messageId } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  try {
    const { db, messages } = await import('@cairn/db')
    const { and, eq, isNull } = await import('drizzle-orm')

    const [message] = await db
      .select({ channelId: messages.channelId })
      .from(messages)
      .where(and(eq(messages.id, messageId), isNull(messages.deletedAt)))
      .limit(1)

    if (!message || !(await canAccessChannel(ctx.workspaceId, ctx.userId, message.channelId, ctx.role))) {
      return NextResponse.json({ error: 'メッセージが見つかりません' }, { status: 404 })
    }

    return NextResponse.json({ channelId: message.channelId })
  } catch (err) {
    console.error('[/api/messages/[messageId]/location GET] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
