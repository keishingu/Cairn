// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'

export interface ProjectChannelDto {
  channelId: string
  channelName: string
  projectId: string
  projectTitle: string
  startDate: string | null
  endDate: string | null
  archived: boolean
  unreadCount: number
  unreadMentionCount: number
}

export async function GET() {
  try {
    const { getAuthContext } = await import('@/lib/get-auth-context')
    const { ctx, error } = await getAuthContext()
    if (error) return error

    const { db } = await import('@cairn/db')
    const { channels, projects, projectMembers, activeWorkspaceMembers, channelReadStates, messages } = await import('@cairn/db')
    const { eq, and, isNull, gt, count, sql, inArray, ne } = await import('drizzle-orm')

    // ゲストは参加中のプロジェクトのチャンネルのみ参照可能（active membership のロールで判定）
    const [wsMember] = await db
      .select({ role: activeWorkspaceMembers.role })
      .from(activeWorkspaceMembers)
      .where(and(eq(activeWorkspaceMembers.workspaceId, ctx.workspaceId), eq(activeWorkspaceMembers.userId, ctx.userId)))
      .limit(1)

    const isGuest = wsMember?.role === 'guest'
    let guestProjectIds: string[] | null = null
    if (isGuest) {
      const memberRows = await db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(eq(projectMembers.userId, ctx.userId))
      guestProjectIds = memberRows.map(r => r.projectId)
      if (guestProjectIds.length === 0) return NextResponse.json([])
    }

    const rows = await db
      .select({
        channelId: channels.id,
        channelName: sql<string>`coalesce(${channels.name}, 'general')`,
        projectId: projects.id,
        projectTitle: projects.title,
        startDate: projects.startDate,
        endDate: projects.endDate,
        archived: projects.archived,
      })
      .from(channels)
      .innerJoin(projects, eq(channels.projectId, projects.id))
      .where(
        and(
          eq(projects.workspaceId, ctx.workspaceId),
          guestProjectIds ? inArray(projects.id, guestProjectIds) : undefined,
        )
      )
      // アーカイブ済みは末尾にまとめる（自動選択や折りたたみ表示の前提）
      .orderBy(projects.archived, projects.createdAt)

    if (rows.length === 0) return NextResponse.json([])

    const channelIds = rows.map(r => r.channelId)

    const [unreadRows, mentionRows] = await Promise.all([
      db
        .select({ channelId: messages.channelId, cnt: count() })
        .from(messages)
        .leftJoin(
          channelReadStates,
          and(eq(channelReadStates.channelId, messages.channelId), eq(channelReadStates.userId, ctx.userId)),
        )
        .where(
          and(
            inArray(messages.channelId, channelIds),
            isNull(messages.deletedAt),
            ne(messages.senderId, ctx.userId),
            gt(messages.createdAt, sql`coalesce(${channelReadStates.lastReadAt}, '-infinity'::timestamptz)`),
          ),
        )
        .groupBy(messages.channelId),
      db
        .select({ channelId: channelReadStates.channelId, cnt: channelReadStates.unreadMentionCount })
        .from(channelReadStates)
        .where(and(eq(channelReadStates.userId, ctx.userId), inArray(channelReadStates.channelId, channelIds))),
    ])

    const unreadMap = new Map(unreadRows.map(r => [r.channelId, r.cnt]))
    const mentionMap = new Map(mentionRows.map(r => [r.channelId, r.cnt]))

    const result: ProjectChannelDto[] = rows.map(r => ({
      ...r,
      unreadCount: unreadMap.get(r.channelId) ?? 0,
      unreadMentionCount: mentionMap.get(r.channelId) ?? 0,
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/projects/channels] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
