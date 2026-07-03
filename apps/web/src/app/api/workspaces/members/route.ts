// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { getWorkspaceMemberRole } from '@/lib/permissions'
import { createServiceRoleClient, resolveEmailsByUserId } from '@/lib/supabase/service'

export interface WorkspaceMemberDto {
  userId: string
  displayName: string
  email: string | null
  avatarUrl: string | null
  role: 'owner' | 'admin' | 'member' | 'guest'
  joinedAt: string
  projectCount: number
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const admin = createServiceRoleClient()
    const { db } = await import('@cairn/db')
    const { profiles, workspaceMembers, projectMembers, projects } = await import('@cairn/db')
    const { eq, and, count, sql, inArray } = await import('drizzle-orm')

    // ゲストはワークスペース全体のメンバー一覧を見られない。
    // 参加プロジェクトの共同メンバーのみに絞り、projectCount も共有プロジェクト数に限定して、
    // 参加していないプロジェクトの存在が漏れないようにする。
    const callerRole = await getWorkspaceMemberRole(ctx.workspaceId, ctx.userId)
    const isGuest = callerRole === 'guest'

    let guestProjectIds: string[] = []
    let visibleUserIds: string[] = []
    if (isGuest) {
      const ownProjects = await db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .innerJoin(projects, eq(projectMembers.projectId, projects.id))
        .where(and(eq(projectMembers.userId, ctx.userId), eq(projects.workspaceId, ctx.workspaceId)))
      guestProjectIds = [...new Set(ownProjects.map(r => r.projectId))]

      if (guestProjectIds.length === 0) {
        // どのプロジェクトにも属さないゲストは自分自身のみ見える
        visibleUserIds = [ctx.userId]
      } else {
        const coMembers = await db
          .select({ userId: projectMembers.userId })
          .from(projectMembers)
          .where(inArray(projectMembers.projectId, guestProjectIds))
        visibleUserIds = [...new Set([ctx.userId, ...coMembers.map(r => r.userId)])]
      }
    }

    // projectCount の集計対象。ゲストは共有プロジェクトのみに限定する。
    const projectCountSq = db
      .select({
        userId: projectMembers.userId,
        n: count().as('n'),
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .where(
        isGuest && guestProjectIds.length > 0
          ? and(eq(projects.workspaceId, ctx.workspaceId), inArray(projectMembers.projectId, guestProjectIds))
          : eq(projects.workspaceId, ctx.workspaceId),
      )
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
      .where(
        isGuest
          ? and(eq(workspaceMembers.workspaceId, ctx.workspaceId), inArray(workspaceMembers.userId, visibleUserIds))
          : eq(workspaceMembers.workspaceId, ctx.workspaceId),
      )
      .orderBy(profiles.displayName)

    const emails = await resolveEmailsByUserId(admin, rows.map(row => row.userId))

    const result: WorkspaceMemberDto[] = rows.map(r => ({
      userId: r.userId,
      displayName: r.displayName,
      email: emails.get(r.userId) ?? null,
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
