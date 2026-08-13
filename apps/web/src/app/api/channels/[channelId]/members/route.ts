// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
import { lockActiveMemberships } from '@/lib/access/active-membership-lock'

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

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId, ctx.role)
  if (forbidden) return forbidden

  try {
    const { db } = await import('@cairn/db')
    const { channelMembers, activeWorkspaceMembers } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    const rows = await db
      .select({ userId: channelMembers.userId, channelId: channelMembers.channelId })
      .from(channelMembers)
      .innerJoin(activeWorkspaceMembers, and(
        eq(activeWorkspaceMembers.workspaceId, ctx.workspaceId),
        eq(activeWorkspaceMembers.userId, channelMembers.userId),
      ))
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

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId, ctx.role)
  if (forbidden) return forbidden

  try {
    const { db } = await import('@cairn/db')
    const { channels, channelMembers, channelReadStates, activeWorkspaceMembers } = await import('@cairn/db')
    const { eq, and, or, sql } = await import('drizzle-orm')
    const parentChannelId = sql<string | null>`to_jsonb(${channels})->>'parent_channel_id'`

    // 自ワークスペースの active メンバー以外を追加できないようにする（不正な channel_members 行や
    // 非活性メンバーの追加を防ぐ）
    const [member] = await db
      .select({ userId: activeWorkspaceMembers.userId })
      .from(activeWorkspaceMembers)
      .where(and(eq(activeWorkspaceMembers.workspaceId, ctx.workspaceId), eq(activeWorkspaceMembers.userId, userId)))
      .limit(1)

    if (!member) {
      return NextResponse.json({ error: '指定されたユーザーはワークスペースのメンバーではありません' }, { status: 422 })
    }

    const [targetChannel] = await db
      .select({ id: channels.id, parentChannelId })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1)

    if (!targetChannel) {
      return NextResponse.json({ error: 'チャンネルが見つかりません' }, { status: 404 })
    }

    const rootChannelId = targetChannel.parentChannelId ?? targetChannel.id
    const added = await db.transaction(async tx => {
      if (!(await lockActiveMemberships(tx, ctx.workspaceId, [ctx.userId, userId]))) return false

      // 子スレッド作成とメンバー追加を同じ親行で直列化し、参加者の取りこぼしを防ぐ。
      await tx
        .select({ id: channels.id })
        .from(channels)
        .where(eq(channels.id, rootChannelId))
        .for('update')
        .limit(1)

      const relatedChannels = await tx
        .select({ id: channels.id })
        .from(channels)
        .where(or(eq(channels.id, rootChannelId), eq(parentChannelId, rootChannelId)))
      const relatedChannelIds = relatedChannels.map(channel => channel.id)

      await tx
        .insert(channelMembers)
        .values(relatedChannelIds.map(id => ({ channelId: id, userId })))
        .onConflictDoNothing()

      // 参加時点を既読の起点にする。これがないと参加直後に過去メッセージ全件が未読として表示される
      const joinedAt = new Date()
      await tx
        .insert(channelReadStates)
        .values(relatedChannelIds.map(id => ({ userId, channelId: id, lastReadAt: joinedAt })))
        .onConflictDoUpdate({
          target: [channelReadStates.userId, channelReadStates.channelId],
          set: { lastReadAt: joinedAt, updatedAt: joinedAt },
          // メンション配信が作った合成状態だけを進め、実際の既読履歴は保持する。
          setWhere: sql`${channelReadStates.lastReadAt} = 'epoch'::timestamptz
            and ${channelReadStates.lastReadMessageId} is null`,
        })

      return true
    })

    if (!added) {
      return NextResponse.json({ error: '指定されたユーザーはワークスペースのメンバーではありません' }, { status: 422 })
    }

    return NextResponse.json({ userId, channelId } satisfies ChannelMemberDto, { status: 201 })
  } catch (err) {
    console.error('[/api/channels/[channelId]/members POST] DB error:', err)
    return NextResponse.json({ error: 'メンバーの追加に失敗しました' }, { status: 500 })
  }
}
