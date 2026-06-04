// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export interface WorkspaceMemberDto {
  userId: string
  displayName: string
  avatarUrl: string | null
  role: 'owner' | 'admin' | 'member' | 'guest'
  joinedAt: string
}

function mockMembers(): WorkspaceMemberDto[] {
  return [
    { userId: 'm1', displayName: '山田 太郎', avatarUrl: null, role: 'owner',  joinedAt: '2026-01-01' },
    { userId: 'm2', displayName: '佐藤 花子', avatarUrl: null, role: 'admin',  joinedAt: '2026-01-05' },
    { userId: 'm3', displayName: '鈴木 健',   avatarUrl: null, role: 'member', joinedAt: '2026-01-10' },
    { userId: 'm4', displayName: '田中 陽子', avatarUrl: null, role: 'member', joinedAt: '2026-01-12' },
    { userId: 'm5', displayName: '伊藤 翔',   avatarUrl: null, role: 'member', joinedAt: '2026-02-01' },
    { userId: 'm6', displayName: '高橋 美咲', avatarUrl: null, role: 'member', joinedAt: '2026-02-14' },
    { userId: 'm7', displayName: '中村 拓也', avatarUrl: null, role: 'member', joinedAt: '2026-03-05' },
    { userId: 'm8', displayName: '小林 大地', avatarUrl: null, role: 'guest',  joinedAt: '2026-04-20' },
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
    const { eq } = await import('drizzle-orm')

    const rows = await db
      .select({
        userId: profiles.id,
        displayName: profiles.displayName,
        avatarUrl: workspaceMembers.avatarUrl,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.joinedAt,
      })
      .from(workspaceMembers)
      .innerJoin(profiles, eq(workspaceMembers.userId, profiles.id))
      .where(eq(workspaceMembers.workspaceId, ctx.workspaceId))
      .orderBy(profiles.displayName)

    const result: WorkspaceMemberDto[] = rows.map(r => ({
      userId: r.userId,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl ?? null,
      role: r.role,
      joinedAt: r.joinedAt.toISOString().slice(0, 10),
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/workspaces/members] DB query failed, using mock data:', err)
    return NextResponse.json(mockMembers())
  }
}
