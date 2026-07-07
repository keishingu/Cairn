// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { getWorkspaceMemberRole } from '@/lib/permissions'
import { coverPhotoIdxFromId } from '@/lib/utils'

export interface MemberProjectDto {
  projectId: string
  title: string
  statusName: string | null
  statusColor: string | null
  role: 'leader' | 'subleader' | 'member' | 'reviewer' | 'observer'
  startDate: string | null
  endDate: string | null
  memberCount: number
  coverPhotoIdx: number
  archived: boolean
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db } = await import('@cairn/db')
    const { projects, projectStatuses, projectMembers, workspaceMembers } = await import('@cairn/db')
    const { eq, and, count, inArray } = await import('drizzle-orm')

    // verify the target user belongs to this workspace
    const [wsMember] = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, ctx.workspaceId),
        eq(workspaceMembers.userId, userId),
      ))

    if (!wsMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    // ゲストは対象ユーザーのプロジェクトを丸ごと見られない。
    // 自分が参加するプロジェクトとの共通分だけに絞り、参加していないプロジェクトの存在が漏れないようにする。
    const callerRole = await getWorkspaceMemberRole(ctx.workspaceId, ctx.userId)
    let guestProjectIds: string[] | null = null
    if (callerRole === 'guest') {
      const ownProjects = await db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .innerJoin(projects, eq(projectMembers.projectId, projects.id))
        .where(and(eq(projectMembers.userId, ctx.userId), eq(projects.workspaceId, ctx.workspaceId)))
      guestProjectIds = [...new Set(ownProjects.map(r => r.projectId))]

      // 共通プロジェクトが無ければ空配列を返す
      if (guestProjectIds.length === 0) {
        return NextResponse.json([])
      }
    }

    const rows = await db
      .select({
        projectId:   projects.id,
        title:       projects.title,
        statusName:  projectStatuses.name,
        statusColor: projectStatuses.color,
        role:        projectMembers.role,
        startDate:   projects.startDate,
        endDate:     projects.endDate,
        archived:    projects.archived,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
      .where(and(
        eq(projectMembers.userId, userId),
        eq(projects.workspaceId, ctx.workspaceId),
        ...(guestProjectIds ? [inArray(projects.id, guestProjectIds)] : []),
      ))
      .orderBy(projects.createdAt)

    // rows が空のときはスキップ（全 project_members を全件取得するのを防ぐ）
    const projectIds = rows.map(r => r.projectId)
    const memberCounts = projectIds.length > 0
      ? await db
          .select({ projectId: projectMembers.projectId, n: count() })
          .from(projectMembers)
          .where(inArray(projectMembers.projectId, projectIds))
          .groupBy(projectMembers.projectId)
      : []
    const countMap = new Map(memberCounts.map(r => [r.projectId, Number(r.n)]))

    return NextResponse.json(
      rows.map(r => ({
        projectId:     r.projectId,
        title:         r.title,
        statusName:    r.statusName ?? null,
        statusColor:   r.statusColor ?? null,
        role:          r.role,
        startDate:     r.startDate ?? null,
        endDate:       r.endDate ?? null,
        memberCount:   countMap.get(r.projectId) ?? 0,
        coverPhotoIdx: coverPhotoIdxFromId(r.projectId),
        archived:      r.archived,
      } satisfies MemberProjectDto)),
    )
  } catch (err) {
    console.error('[GET /api/workspaces/members/[userId]/projects]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
