// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'

export interface ChannelMemberDto {
  userId: string
  channelId: string
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const { channelId } = await params

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId)
  if (forbidden) return forbidden

  try {
    const { db } = await import('@cairn/db')
    const { channelMembers } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const rows = await db
      .select({ userId: channelMembers.userId, channelId: channelMembers.channelId })
      .from(channelMembers)
      .where(eq(channelMembers.channelId, channelId))

    return NextResponse.json(rows satisfies ChannelMemberDto[])
  } catch (err) {
    console.error('[/api/channels/[channelId]/members GET] DB error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const { channelId } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const userId = typeof (body as { userId?: unknown }).userId === 'string'
    ? ((body as { userId: string }).userId).trim()
    : ''

  if (!userId) {
    return NextResponse.json({ error: 'userIdが必要です' }, { status: 400 })
  }

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId)
  if (forbidden) return forbidden

  try {
    const { db } = await import('@cairn/db')
    const { channelMembers, channelReadStates, workspaceMembers } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    // 自ワークスペースに属さない userId を追加できないようにする（不正な channel_members 行の作成防止）
    const [member] = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)

    if (!member) {
      return NextResponse.json({ error: '指定されたユーザーはワークスペースのメンバーではありません' }, { status: 422 })
    }

    await db
      .insert(channelMembers)
      .values({ channelId, userId })
      .onConflictDoNothing()

    // 参加時点を既読の起点にする。これがないと参加直後に過去メッセージ全件が未読として表示される
    await db
      .insert(channelReadStates)
      .values({ userId, channelId, lastReadAt: new Date() })
      .onConflictDoNothing()

    return NextResponse.json({ userId, channelId } satisfies ChannelMemberDto, { status: 201 })
  } catch (err) {
    console.error('[/api/channels/[channelId]/members POST] DB error:', err)
    return NextResponse.json({ error: 'メンバーの追加に失敗しました' }, { status: 500 })
  }
}
