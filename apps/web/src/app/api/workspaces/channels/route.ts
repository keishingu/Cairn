// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { getWorkspaceMemberRole, requireWorkspaceAdmin } from '@/lib/permissions'
import { hasWorkspaceMemberDisplayNameColumn, workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'

export interface WorkspaceChannelDto {
  id: string
  name: string | null
  isPrivate: boolean
  memberCount: number
  memberNames: string[]
  memberAvatarUrls: (string | null)[]
  unreadCount: number
  unreadMentionCount: number
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db } = await import('@cairn/db')
    const { channels, channelMembers, profiles } = await import('@cairn/db')
    const { and, eq, inArray } = await import('drizzle-orm')

    const allChannelRows = await db
      .select({ id: channels.id, name: channels.name, isPrivate: channels.isPrivate })
      .from(channels)
      .where(and(eq(channels.workspaceId, ctx.workspaceId), eq(channels.type, 'workspace')))
      .orderBy(channels.createdAt)

    // ワークスペースチャンネルはWS全体向け。ゲストには自分が参加しているチャンネルのみに絞り、
    // 参加していないチャンネルの存在やメンバー構成が漏れないようにする。
    const callerRole = await getWorkspaceMemberRole(ctx.workspaceId, ctx.userId)
    let channelRows = allChannelRows
    if (callerRole === 'guest') {
      if (allChannelRows.length === 0) return NextResponse.json([] satisfies WorkspaceChannelDto[])
      const joined = await db
        .select({ channelId: channelMembers.channelId })
        .from(channelMembers)
        .where(and(
          eq(channelMembers.userId, ctx.userId),
          inArray(channelMembers.channelId, allChannelRows.map(c => c.id)),
        ))
      const joinedIds = new Set(joined.map(r => r.channelId))
      channelRows = allChannelRows.filter(c => joinedIds.has(c.id))
    }

    if (channelRows.length === 0) return NextResponse.json([] satisfies WorkspaceChannelDto[])

    const { workspaceMembers } = await import('@cairn/db')
    const displayNameExpr = (await hasWorkspaceMemberDisplayNameColumn(db))
      ? workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName)
      : profiles.displayName
    const memberRows = await db
      .select({
        channelId: channelMembers.channelId,
        displayName: displayNameExpr,
        avatarUrl: workspaceMembers.avatarUrl,
      })
      .from(channelMembers)
      .innerJoin(profiles, eq(channelMembers.userId, profiles.id))
      .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, channelMembers.userId), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
      .where(inArray(channelMembers.channelId, channelRows.map(c => c.id)))
      .orderBy(channelMembers.joinedAt)

    const membersByChannel = new Map<string, { name: string; avatarUrl: string | null }[]>()
    for (const m of memberRows) {
      const arr = membersByChannel.get(m.channelId) ?? []
      arr.push({ name: m.displayName, avatarUrl: m.avatarUrl ?? null })
      membersByChannel.set(m.channelId, arr)
    }

    const channelIds = channelRows.map(c => c.id)
    const { channelReadStates, messages } = await import('@cairn/db')
    const { isNull, gt, count, sql, ne } = await import('drizzle-orm')

    const [unreadRows, mentionRows] = await Promise.all([
      channelIds.length > 0
        ? db
            .select({ channelId: messages.channelId, cnt: count() })
            .from(messages)
            .leftJoin(channelReadStates, and(eq(channelReadStates.channelId, messages.channelId), eq(channelReadStates.userId, ctx.userId)))
            .where(and(inArray(messages.channelId, channelIds), isNull(messages.deletedAt), ne(messages.senderId, ctx.userId), gt(messages.createdAt, sql`coalesce(${channelReadStates.lastReadAt}, '-infinity'::timestamptz)`)))
            .groupBy(messages.channelId)
        : Promise.resolve([]),
      channelIds.length > 0
        ? db
            .select({ channelId: channelReadStates.channelId, cnt: channelReadStates.unreadMentionCount })
            .from(channelReadStates)
            .where(and(eq(channelReadStates.userId, ctx.userId), inArray(channelReadStates.channelId, channelIds)))
        : Promise.resolve([]),
    ])

    const unreadMap = new Map(unreadRows.map(r => [r.channelId, r.cnt]))
    const mentionMap = new Map(mentionRows.map(r => [r.channelId, r.cnt]))

    const result: WorkspaceChannelDto[] = channelRows.map(c => {
      const members = membersByChannel.get(c.id) ?? []
      const top4 = members.slice(0, 4)
      return {
        id: c.id, name: c.name, isPrivate: c.isPrivate,
        memberCount: members.length,
        memberNames: top4.map(m => m.name),
        memberAvatarUrls: top4.map(m => m.avatarUrl),
        unreadCount: unreadMap.get(c.id) ?? 0,
        unreadMentionCount: mentionMap.get(c.id) ?? 0,
      }
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/workspaces/channels] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 })
  }
  const body = typeof rawBody === 'object' && rawBody !== null && !Array.isArray(rawBody)
    ? rawBody as Record<string, unknown>
    : {}

  const name = typeof body['name'] === 'string' ? body['name'].trim() : ''
  const isPrivate = body['isPrivate'] === true

  if (!name) {
    return NextResponse.json({ error: 'チャンネル名を入力してください' }, { status: 400 })
  }
  if (name.length > 60) {
    return NextResponse.json({ error: '60文字以内で入力してください' }, { status: 400 })
  }

  const forbidden = await requireWorkspaceAdmin(ctx.workspaceId, ctx.userId)
  if (forbidden) return forbidden

  try {
    const { db } = await import('@cairn/db')
    const { channels, channelMembers } = await import('@cairn/db')

    const rows = await db
      .insert(channels)
      .values({
        workspaceId: ctx.workspaceId,
        type: 'workspace',
        name,
        isPrivate,
      })
      .returning({ id: channels.id, name: channels.name, isPrivate: channels.isPrivate })

    const inserted = rows[0]
    if (!inserted) throw new Error('insert returned no rows')

    // プライベートチャンネルはメンバーのみアクセス可。作成者が締め出されないよう channel_members に追加する。
    if (isPrivate) {
      await db.insert(channelMembers).values({ channelId: inserted.id, userId: ctx.userId })
    }

    const memberCount = isPrivate ? 1 : 0
    const result: WorkspaceChannelDto = { ...inserted, memberCount, memberNames: [], memberAvatarUrls: [], unreadCount: 0, unreadMentionCount: 0 }
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('[/api/workspaces/channels POST] DB error:', err)
    return NextResponse.json({ error: 'チャンネルの作成に失敗しました' }, { status: 500 })
  }
}
