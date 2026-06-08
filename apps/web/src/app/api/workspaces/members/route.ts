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
  projectCount: number
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db } = await import('@cairn/db')
    const { profiles, workspaceMembers, projectMembers, projects } = await import('@cairn/db')
    const { eq, and, count, sql } = await import('drizzle-orm')

    const projectCountSq = db
      .select({
        userId: projectMembers.userId,
        n: count().as('n'),
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .where(eq(projects.workspaceId, ctx.workspaceId))
      .groupBy(projectMembers.userId)
      .as('pc')

    const rows = await db
      .select({
        userId: profiles.id,
        displayName: profiles.displayName,
        avatarUrl: workspaceMembers.avatarUrl,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.joinedAt,
        projectCount: sql<number>`coalesce(${projectCountSq.n}, 0)`,
      })
      .from(workspaceMembers)
      .innerJoin(profiles, eq(workspaceMembers.userId, profiles.id))
      .leftJoin(projectCountSq, eq(projectCountSq.userId, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, ctx.workspaceId))
      .orderBy(profiles.displayName)

    const result: WorkspaceMemberDto[] = rows.map(r => ({
      userId: r.userId,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl ?? null,
      role: r.role,
      joinedAt: r.joinedAt.toISOString().slice(0, 10),
      projectCount: Number(r.projectCount),
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/workspaces/members] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
