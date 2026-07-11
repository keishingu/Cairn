// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'

export interface DmChannelDto {
  id: string
  participantId: string
  participantName: string
  participantAvatarUrl: string | null
  unreadCount: number
  unreadMentionCount: number
}

const createDmSchema = z.object({ targetUserId: z.string().uuid() })

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db } = await import('@cairn/db')
    const { channels, channelMembers, profiles, workspaceMembers } = await import('@cairn/db')
    const { and, eq, inArray, ne } = await import('drizzle-orm')

    // 自分が参加している DM チャンネル ID を取得
    const myChannelIds = db
      .select({ channelId: channelMembers.channelId })
      .from(channelMembers)
      .where(eq(channelMembers.userId, ctx.userId))

    // 相手メンバーの情報を取得
    const rows = await db
      .select({
        id: channels.id,
        participantId: profiles.id,
        participantName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
        participantAvatarUrl: workspaceMembers.avatarUrl,
      })
      .from(channels)
      .innerJoin(channelMembers, eq(channelMembers.channelId, channels.id))
      .innerJoin(profiles, eq(profiles.id, channelMembers.userId))
      .innerJoin(workspaceMembers, and(
        eq(workspaceMembers.userId, profiles.id),
        eq(workspaceMembers.workspaceId, ctx.workspaceId),
      ))
      .where(
        and(
          eq(channels.workspaceId, ctx.workspaceId),
          eq(channels.type, 'dm'),
          ne(channelMembers.userId, ctx.userId),
          inArray(channels.id, myChannelIds),
        ),
      )
      .orderBy(workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName))

    const channelIds = rows.map(r => r.id)
    if (channelIds.length > 0) {
      const { channelReadStates, messages } = await import('@cairn/db')
      const { isNull, gt, count, sql: sql2, inArray, ne } = await import('drizzle-orm')

      const [unreadRows, mentionRows] = await Promise.all([
        db
          .select({ channelId: messages.channelId, cnt: count() })
          .from(messages)
          .leftJoin(channelReadStates, and(eq(channelReadStates.channelId, messages.channelId), eq(channelReadStates.userId, ctx.userId)))
          .where(and(inArray(messages.channelId, channelIds), isNull(messages.deletedAt), ne(messages.senderId, ctx.userId), gt(messages.createdAt, sql2`coalesce(${channelReadStates.lastReadAt}, '-infinity'::timestamptz)`)))
          .groupBy(messages.channelId),
        db
          .select({ channelId: channelReadStates.channelId, cnt: channelReadStates.unreadMentionCount })
          .from(channelReadStates)
          .where(and(eq(channelReadStates.userId, ctx.userId), inArray(channelReadStates.channelId, channelIds))),
      ])

      const unreadMap = new Map(unreadRows.map(r => [r.channelId, r.cnt]))
      const mentionMap = new Map(mentionRows.map(r => [r.channelId, r.cnt]))

      return NextResponse.json(rows.map(r => ({
        ...r,
        participantAvatarUrl: r.participantAvatarUrl ?? null,
        unreadCount: unreadMap.get(r.id) ?? 0,
        unreadMentionCount: mentionMap.get(r.id) ?? 0,
      })) satisfies DmChannelDto[])
    }

    return NextResponse.json(rows.map(r => ({ ...r, participantAvatarUrl: r.participantAvatarUrl ?? null, unreadCount: 0, unreadMentionCount: 0 })) satisfies DmChannelDto[])
  } catch (err) {
    console.error('[/api/workspaces/dms GET] failed:', err)
    return NextResponse.json([] satisfies DmChannelDto[])
  }
}

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = createDmSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }
  const { targetUserId } = parsed.data

  try {
    const { db } = await import('@cairn/db')
    const { channels, channelMembers, channelReadStates, activeWorkspaceMembers } = await import('@cairn/db')
    const { and, eq, inArray, sql } = await import('drizzle-orm')

    const [targetMember] = await db
      .select({ userId: activeWorkspaceMembers.userId })
      .from(activeWorkspaceMembers)
      .where(and(
        eq(activeWorkspaceMembers.workspaceId, ctx.workspaceId),
        eq(activeWorkspaceMembers.userId, targetUserId),
      ))
      .limit(1)

    if (!targetMember) {
      return NextResponse.json({ error: '指定されたユーザーはワークスペースのメンバーではありません' }, { status: 422 })
    }

    // 既存の DM チャンネルを探す（両者が参加している）
    const myChannelIds = db
      .select({ channelId: channelMembers.channelId })
      .from(channelMembers)
      .where(eq(channelMembers.userId, ctx.userId))

    const targetChannelIds = db
      .select({ channelId: channelMembers.channelId })
      .from(channelMembers)
      .where(eq(channelMembers.userId, targetUserId))

    const existing = await db
      .select({ id: channels.id })
      .from(channels)
      .where(
        and(
          eq(channels.workspaceId, ctx.workspaceId),
          eq(channels.type, 'dm'),
          inArray(channels.id, myChannelIds),
          inArray(channels.id, targetChannelIds),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      return NextResponse.json({ id: existing[0]!.id })
    }

    const [ch] = await db
      .insert(channels)
      .values({ workspaceId: ctx.workspaceId, type: 'dm' })
      .returning({ id: channels.id })

    if (!ch) throw new Error('channel insert failed')

    await db.insert(channelMembers).values([
      { channelId: ch.id, userId: ctx.userId },
      { channelId: ch.id, userId: targetUserId },
    ])

    // 両参加者の既読起点を作成時点にする（参加直後の過去履歴未読を防ぐ。新規DMでは履歴ゼロだが一貫性のため）
    await db.insert(channelReadStates).values([
      { channelId: ch.id, userId: ctx.userId, lastReadAt: new Date() },
      { channelId: ch.id, userId: targetUserId, lastReadAt: new Date() },
    ]).onConflictDoNothing()

    void sql // suppress unused import warning

    return NextResponse.json({ id: ch.id }, { status: 201 })
  } catch (err) {
    console.error('[/api/workspaces/dms POST] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
