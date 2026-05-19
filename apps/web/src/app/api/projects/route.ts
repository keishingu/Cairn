// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { PROJECTS, STATUS, type StatusKey } from '@/components/app/data'

export interface ProjectDto {
  id: string
  title: string
  statusName: StatusKey
  startDate: string | null
  endDate: string | null
  memberCount: number
}

function mockProjects(): ProjectDto[] {
  return PROJECTS.map(p => ({
    id: p.id,
    title: p.name,
    statusName: p.status,
    startDate: null,
    endDate: null,
    memberCount: p.members,
  }))
}

export async function GET() {
  if (!process.env['DATABASE_URL']) {
    return NextResponse.json(mockProjects())
  }

  try {
    const { db } = await import('@cairn/db')
    const { projects, projectStatuses, projectMembers } = await import('@cairn/db')
    const { eq, count } = await import('drizzle-orm')

    const rows = await db
      .select({
        id: projects.id,
        title: projects.title,
        statusName: projectStatuses.name,
        startDate: projects.startDate,
        endDate: projects.endDate,
      })
      .from(projects)
      .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
      .where(eq(projects.archived, false))

    const counts = await db
      .select({ projectId: projectMembers.projectId, n: count() })
      .from(projectMembers)
      .groupBy(projectMembers.projectId)

    const countMap = new Map(counts.map(r => [r.projectId, Number(r.n)]))

    const result: ProjectDto[] = rows.map(r => ({
      id: r.id,
      title: r.title,
      statusName: (r.statusName as StatusKey | null) ?? 'plan',
      startDate: r.startDate,
      endDate: r.endDate,
      memberCount: countMap.get(r.id) ?? 0,
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/projects] DB query failed, using mock data:', err)
    return NextResponse.json(mockProjects())
  }
}
