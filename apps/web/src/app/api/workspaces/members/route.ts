// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export interface WorkspaceMemberDto {
  userId: string
  displayName: string
}

function mockMembers(): WorkspaceMemberDto[] {
  return [
    { userId: 'm1', displayName: '山田 太郎' },
    { userId: 'm2', displayName: '佐藤 花子' },
    { userId: 'm3', displayName: '鈴木 健' },
    { userId: 'm4', displayName: '田中 陽子' },
    { userId: 'm5', displayName: '伊藤 翔' },
    { userId: 'm6', displayName: '高橋 美咲' },
    { userId: 'm7', displayName: '中村 拓也' },
    { userId: 'm8', displayName: '小林 大地' },
  ]
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json(mockMembers())
  }

  try {
    const { db } = await import('@cairn/db')
    const { profiles, workspaceMembers } = await import('@cairn/db')
    const { and, eq, ne } = await import('drizzle-orm')

    const rows = await db
      .select({ userId: profiles.id, displayName: profiles.displayName })
      .from(workspaceMembers)
      .innerJoin(profiles, eq(workspaceMembers.userId, profiles.id))
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), ne(workspaceMembers.userId, ctx.userId)))
      .orderBy(profiles.displayName)

    return NextResponse.json(rows satisfies WorkspaceMemberDto[])
  } catch (err) {
    console.error('[/api/workspaces/members] DB query failed, using mock data:', err)
    return NextResponse.json(mockMembers())
  }
}
