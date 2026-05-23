// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { PROJECTS } from '@/components/app/data'
import type { StatusKey } from '@/components/app/data'

export interface MemberProjectDto {
  projectId: string
  title: string
  statusName: StatusKey
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

// userId → [{projectIndex, role}]
const MOCK_MEMBERSHIPS: Record<string, { pi: number; role: MemberProjectDto['role'] }[]> = {
  m1: [{ pi: 0, role: 'leader' },    { pi: 5, role: 'leader' },    { pi: 7, role: 'observer' }],
  m2: [{ pi: 0, role: 'subleader' }, { pi: 1, role: 'subleader' }, { pi: 7, role: 'subleader' }],
  m3: [{ pi: 0, role: 'member' },    { pi: 3, role: 'member' },    { pi: 6, role: 'member' }],
  m4: [{ pi: 1, role: 'member' },    { pi: 4, role: 'member' },    { pi: 5, role: 'member' }],
  m5: [{ pi: 0, role: 'member' },    { pi: 2, role: 'member' },    { pi: 5, role: 'member' }],
  m6: [{ pi: 1, role: 'member' },    { pi: 6, role: 'reviewer' },  { pi: 7, role: 'member' }],
  m7: [{ pi: 2, role: 'member' },    { pi: 3, role: 'member' }],
  m8: [{ pi: 4, role: 'observer' }],
}

function mockMemberProjects(userId: string): MemberProjectDto[] {
  const memberships = MOCK_MEMBERSHIPS[userId] ?? []
  return memberships.map(({ pi, role }) => {
    const p = PROJECTS[pi]!
    return {
      projectId: p.id,
      title:     p.name,
      statusName: p.status,
      role,
      startDate:  p.startDate,
      endDate:    p.endDate,
      memberCount: p.members,
      coverPhotoIdx: p.photoIdx,
    }
  })
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  if (!process.env['DATABASE_URL']) {
    void ctx
    return NextResponse.json(mockMemberProjects(userId))
  }

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
        projectId:  projects.id,
        title:      projects.title,
        statusName: projectStatuses.name,
        role:       projectMembers.role,
        startDate:  projects.startDate,
        endDate:    projects.endDate,
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
        statusName:    (r.statusName ?? 'plan') as StatusKey,
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
