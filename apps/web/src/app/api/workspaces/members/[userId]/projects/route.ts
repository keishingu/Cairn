// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

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
    const { projects, projectStatuses, projectMembers, workspaceMembers } = await import('@cairn/db')
    const { eq, and, count } = await import('drizzle-orm')

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

    const rows = await db
      .select({
        projectId:   projects.id,
        title:       projects.title,
        statusName:  projectStatuses.name,
        statusColor: projectStatuses.color,
        role:        projectMembers.role,
        startDate:   projects.startDate,
        endDate:     projects.endDate,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
      .where(and(
        eq(projectMembers.userId, userId),
        eq(projects.workspaceId, ctx.workspaceId),
      ))
      .orderBy(projects.createdAt)

    const memberCounts = await db
      .select({ projectId: projectMembers.projectId, n: count() })
      .from(projectMembers)
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
      } satisfies MemberProjectDto)),
    )
  } catch (err) {
    console.error('[GET /api/workspaces/members/[userId]/projects]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
