// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'

export interface ProjectChannelDto {
  channelId: string
  channelName: string
  projectId: string
  projectTitle: string
}

function mockChannels(): ProjectChannelDto[] {
  return [
    { channelId: '50000000-0000-0000-0000-000000000001', channelName: 'general', projectId: '30000000-0000-0000-0000-000000000001', projectTitle: '北アルプス縦走計画' },
    { channelId: '50000000-0000-0000-0000-000000000002', channelName: 'general', projectId: '30000000-0000-0000-0000-000000000002', projectTitle: '夏山合宿計画' },
    { channelId: '50000000-0000-0000-0000-000000000003', channelName: 'general', projectId: '30000000-0000-0000-0000-000000000003', projectTitle: 'クライミング講習会' },
    { channelId: '50000000-0000-0000-0000-000000000004', channelName: 'general', projectId: '30000000-0000-0000-0000-000000000004', projectTitle: '雪山訓練' },
    { channelId: '50000000-0000-0000-0000-000000000005', channelName: 'general', projectId: '30000000-0000-0000-0000-000000000005', projectTitle: '秋山ハイキング' },
    { channelId: '50000000-0000-0000-0000-000000000006', channelName: 'general', projectId: '30000000-0000-0000-0000-000000000006', projectTitle: '春山合宿' },
    { channelId: '50000000-0000-0000-0000-000000000007', channelName: 'general', projectId: '30000000-0000-0000-0000-000000000007', projectTitle: '沢登り練習会' },
    { channelId: '50000000-0000-0000-0000-000000000008', channelName: 'general', projectId: '30000000-0000-0000-0000-000000000008', projectTitle: '最終ハイキング' },
  ]
}

export async function GET() {
  if (!process.env['DATABASE_URL']) {
    return NextResponse.json(mockChannels())
  }

  try {
    const { db } = await import('@cairn/db')
    const { channels, projects } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const rows = await db
      .select({
        channelId: channels.id,
        channelName: channels.name,
        projectId: projects.id,
        projectTitle: projects.title,
      })
      .from(channels)
      .innerJoin(projects, eq(channels.projectId, projects.id))
      .where(eq(projects.archived, false))
      .orderBy(projects.createdAt)

    return NextResponse.json(rows satisfies ProjectChannelDto[])
  } catch (err) {
    console.error('[/api/projects/channels] DB query failed, using mock data:', err)
    return NextResponse.json(mockChannels())
  }
}
