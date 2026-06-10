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

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

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
    console.error('[/api/workspaces/members] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
