// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { createProjectSchema } from '@cairn/shared'
import { PROJECTS, STATUS, type StatusKey } from '@/components/app/data'
import { getAuthContext } from '@/lib/get-auth-context'

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
    startDate: p.startDate,
    endDate: p.endDate,
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

export async function POST(req: Request) {
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createProjectSchema.safeParse({ ...(body as object), workspaceId: ctx.workspaceId })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json({
      id: crypto.randomUUID(),
      title: parsed.data.title,
      statusName: 'plan' as StatusKey,
      startDate: parsed.data.startDate ?? null,
      endDate: parsed.data.endDate ?? null,
      memberCount: 1,
    } satisfies ProjectDto, { status: 201 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { projects, channels } = await import('@cairn/db')

    const [inserted] = await db
      .insert(projects)
      .values({
        workspaceId: ctx.workspaceId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        statusId: parsed.data.statusId ?? null,
        startDate: parsed.data.startDate ?? null,
        endDate: parsed.data.endDate ?? null,
        createdBy: ctx.userId,
      })
      .returning({ id: projects.id, title: projects.title, startDate: projects.startDate, endDate: projects.endDate })

    if (!inserted) throw new Error('Insert returned no rows')

    await db.insert(channels).values({
      workspaceId: ctx.workspaceId,
      projectId: inserted.id,
      type: 'project',
    })

    return NextResponse.json({
      id: inserted.id,
      title: inserted.title,
      statusName: 'plan' as StatusKey,
      startDate: inserted.startDate,
      endDate: inserted.endDate,
      memberCount: 1,
    } satisfies ProjectDto, { status: 201 })
  } catch (err) {
    console.error('[/api/projects POST] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
