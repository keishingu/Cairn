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
  milestoneId: string | null
  milestoneCompleted: boolean | null
}

export async function GET() {
  try {
    const { getAuthContext } = await import('@/lib/get-auth-context')
    const { ctx, error } = await getAuthContext()
    if (error) return error

    const { db } = await import('@cairn/db')
    const { channels, milestones, projects, projectMembers, workspaceMembers, channelReadStates, messages } = await import('@cairn/db')
    const { eq, and, isNull, gt, count, sql, inArray, ne } = await import('drizzle-orm')

    // ゲストは参加中のプロジェクトのチャンネルのみ参照可能
    const [wsMember] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, ctx.userId)))
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
        channelName: sql<string>`coalesce(${milestones.title}, ${channels.name}, 'general')`,
        projectId: projects.id,
        projectTitle: projects.title,
        startDate: sql<string | null>`coalesce(${milestones.startDate}, ${projects.startDate})`,
        endDate: sql<string | null>`coalesce(${milestones.endDate}, ${projects.endDate})`,
        archived: projects.archived,
        milestoneId: channels.milestoneId,
        milestoneCompleted: milestones.completed,
      })
      .from(channels)
      .innerJoin(projects, eq(channels.projectId, projects.id))
      .leftJoin(milestones, eq(channels.milestoneId, milestones.id))
      .where(
        and(
          eq(projects.workspaceId, ctx.workspaceId),
          guestProjectIds ? inArray(projects.id, guestProjectIds) : undefined,
        )
      )
      // プロジェクト → General → マイルストーン（開始日順）。アーカイブ済みは末尾にまとめる。
      .orderBy(
        projects.archived,
        projects.createdAt,
        sql`case when ${channels.milestoneId} is null then 0 else 1 end`,
        sql`${milestones.startDate} asc nulls last`,
        milestones.createdAt,
      )

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
