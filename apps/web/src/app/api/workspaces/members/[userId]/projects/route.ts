// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { getWorkspaceMemberRole, isWorkspaceAdmin } from '@/lib/permissions'

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

function coverPhotoIdxFromId(id: string): number {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return h
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
    const { projects, projectStatuses, projectMembers, workspaceMembers, activeWorkspaceMembers } = await import('@cairn/db')
    const { eq, and, count, inArray } = await import('drizzle-orm')

    // 対象ユーザーが当該 WS に所属していることを確認する。ここはアーカイブ（非活性）済み
    // メンバーの保存済みプロジェクト履歴を管理者が閲覧する経路でもあるため、active に絞らず
    // workspace_members を引く（§5: 履歴は本人名義で残し、閲覧できるようにする）
    const [wsMember] = await db
      .select({ id: workspaceMembers.id, membershipStatus: workspaceMembers.membershipStatus })
      .from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, ctx.workspaceId),
        eq(workspaceMembers.userId, userId),
      ))

    if (!wsMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const callerRole = await getWorkspaceMemberRole(ctx.workspaceId, ctx.userId)
    if (wsMember.membershipStatus === 'inactive' && !isWorkspaceAdmin(callerRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // ゲストは対象ユーザーのプロジェクトを丸ごと見られない。
    // 自分が参加するプロジェクトとの共通分だけに絞り、参加していないプロジェクトの存在が漏れないようにする。
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

    const memberCounts = await db
      .select({ projectId: projectMembers.projectId, n: count() })
      .from(projectMembers)
      .innerJoin(activeWorkspaceMembers, and(
        eq(activeWorkspaceMembers.workspaceId, ctx.workspaceId),
        eq(activeWorkspaceMembers.userId, projectMembers.userId),
      ))
      .groupBy(projectMembers.projectId)
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
