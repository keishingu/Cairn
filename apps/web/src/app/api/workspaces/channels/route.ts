// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export interface WorkspaceChannelDto {
  id: string
  name: string | null
  isPrivate: boolean
}

function mockChannels(): WorkspaceChannelDto[] {
  return [
    { id: 'g1', name: '雑談',     isPrivate: false },
    { id: 'g2', name: '連絡事項', isPrivate: false },
  ]
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json(mockChannels())
  }

  try {
    const { db } = await import('@cairn/db')
    const { channels } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')

    const rows = await db
      .select({ id: channels.id, name: channels.name, isPrivate: channels.isPrivate })
      .from(channels)
      .where(and(eq(channels.workspaceId, ctx.workspaceId), eq(channels.type, 'workspace')))
      .orderBy(channels.createdAt)

    return NextResponse.json(rows satisfies WorkspaceChannelDto[])
  } catch (err) {
    console.error('[/api/workspaces/channels] DB query failed, using mock data:', err)
    return NextResponse.json(mockChannels())
  }
}
