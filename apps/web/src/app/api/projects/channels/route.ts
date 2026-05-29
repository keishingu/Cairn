// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'

export interface ProjectChannelDto {
  channelId: string
  channelName: string
  projectId: string
  projectTitle: string
  unreadCount: number
  unreadMentionCount: number
}

function mockChannels(): ProjectChannelDto[] {
  return [
    { channelId: '50000000-0000-0000-0000-000000000001', channelName: 'general', projectId: '30000000-0000-0000-0000-000000000001', projectTitle: '北アルプス縦走計画', unreadCount: 3, unreadMentionCount: 1 },
    { channelId: '50000000-0000-0000-0000-000000000002', channelName: 'general', projectId: '30000000-0000-0000-0000-000000000002', projectTitle: '夏山合宿計画', unreadCount: 0, unreadMentionCount: 0 },
    { channelId: '50000000-0000-0000-0000-000000000003', channelName: 'general', projectId: '30000000-0000-0000-0000-000000000003', projectTitle: 'クライミング講習会', unreadCount: 0, unreadMentionCount: 0 },
    { channelId: '50000000-0000-0000-0000-000000000004', channelName: 'general', projectId: '30000000-0000-0000-0000-000000000004', projectTitle: '雪山訓練', unreadCount: 0, unreadMentionCount: 0 },
    { channelId: '50000000-0000-0000-0000-000000000005', channelName: 'general', projectId: '30000000-0000-0000-0000-000000000005', projectTitle: '秋山ハイキング', unreadCount: 0, unreadMentionCount: 0 },
    { channelId: '50000000-0000-0000-0000-000000000006', channelName: 'general', projectId: '30000000-0000-0000-0000-000000000006', projectTitle: '春山合宿', unreadCount: 0, unreadMentionCount: 0 },
    { channelId: '50000000-0000-0000-0000-000000000007', channelName: 'general', projectId: '30000000-0000-0000-0000-000000000007', projectTitle: '沢登り練習会', unreadCount: 0, unreadMentionCount: 0 },
    { channelId: '50000000-0000-0000-0000-000000000008', channelName: 'general', projectId: '30000000-0000-0000-0000-000000000008', projectTitle: '最終ハイキング', unreadCount: 0, unreadMentionCount: 0 },
  ]
}

export async function GET() {
  if (!process.env['DATABASE_URL']) {
    return NextResponse.json(mockChannels())
  }

  try {
    const { getAuthContext } = await import('@/lib/get-auth-context')
    const { ctx, error } = await getAuthContext()
    if (error) return error

    const { db } = await import('@cairn/db')
    const { channels, projects, channelReadStates, messages } = await import('@cairn/db')
    const { eq, and, isNull, gt, count, sql, inArray } = await import('drizzle-orm')

    const rows = await db
      .select({
        channelId: channels.id,
        channelName: sql<string>`coalesce(${channels.name}, 'general')`,
        projectId: projects.id,
        projectTitle: projects.title,
      })
      .from(channels)
      .innerJoin(projects, eq(channels.projectId, projects.id))
      .where(eq(projects.archived, false))
      .orderBy(projects.createdAt)

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
    console.error('[/api/projects/channels] DB query failed, using mock data:', err)
    return NextResponse.json(mockChannels())
  }
}
