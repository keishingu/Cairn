// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export interface ChannelMemberDto {
  userId: string
  channelId: string
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const { channelId } = await params
  const body = await req.json() as { userId?: unknown }
  const userId = typeof body.userId === 'string' ? body.userId.trim() : ''

  if (!userId) {
    return NextResponse.json({ error: 'userIdが必要です' }, { status: 400 })
  }

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json({ userId, channelId } satisfies ChannelMemberDto, { status: 201 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { channels, channelMembers } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')

    // チャンネルが同じワークスペースに属するか確認
    const [channel] = await db
      .select({ id: channels.id })
      .from(channels)
      .where(and(eq(channels.id, channelId), eq(channels.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!channel) {
      return NextResponse.json({ error: 'チャンネルが見つかりません' }, { status: 404 })
    }

    await db
      .insert(channelMembers)
      .values({ channelId, userId })
      .onConflictDoNothing()

    return NextResponse.json({ userId, channelId } satisfies ChannelMemberDto, { status: 201 })
  } catch (err) {
    console.error('[/api/channels/[channelId]/members POST] DB error:', err)
    return NextResponse.json({ error: 'メンバーの追加に失敗しました' }, { status: 500 })
  }
}
