// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { createProjectSchema } from '@cairn/shared'
import { PROJECTS, MEMBERS } from '@/components/app/data'
import { getAuthContext } from '@/lib/get-auth-context'

export interface ProjectDto {
  id: string
  title: string
  description: string | null
  statusName: string | null
  statusColor: string | null
  startDate: string | null
  endDate: string | null
  memberCount: number
  memberNames: string[]
  taskCount: number
  completedTaskCount: number
  isOwner: boolean
  isMember: boolean
  archived: boolean
  coverPhotoIdx: number
  coverPhotoUrl: string | null
}

const STATUS_COLOR_MAP: Record<string, string> = {
  '計画中':     '#3B82F6',
  '審議中':     '#F59E0B',
  '実施待ち':   '#10B981',
  '実施中':     '#8B5CF6',
  '振り返り中': '#F43F5E',
  '完了':       '#6B7280',
}

function mockProjects(): ProjectDto[] {
  return PROJECTS.map((p, i) => ({
    id: p.id,
    title: p.name,
    description: null,
    statusName: p.status,
    statusColor: STATUS_COLOR_MAP[p.status] ?? '#6B7280',
    startDate: p.startDate,
    endDate: p.endDate,
    memberCount: p.members,
    memberNames: MEMBERS.slice(0, Math.min(p.members, 4)),
    taskCount: 5 + (i * 3) % 8,
    completedTaskCount: 1 + (i * 2) % 5,
    isOwner: i % 3 === 0,
    isMember: true,
    archived: false,
    coverPhotoIdx: p.photoIdx,
    coverPhotoUrl: null,
  }))
}

function coverPhotoIdxFromId(id: string): number {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return h
}

export async function GET() {
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json(mockProjects())
  }

  try {
    const { db } = await import('@cairn/db')
    const { projects, projectStatuses, projectMembers, tasks, profiles } = await import('@cairn/db')
    const { eq, count, and } = await import('drizzle-orm')
    const { sql } = await import('drizzle-orm')

    const rows = await db
      .select({
        id: projects.id,
        title: projects.title,
        description: projects.description,
        statusName: projectStatuses.name,
        statusColor: projectStatuses.color,
        startDate: projects.startDate,
        endDate: projects.endDate,
        archived: projects.archived,
        createdBy: projects.createdBy,
        coverPhotoUrl: projects.coverPhotoUrl,
      })
      .from(projects)
      .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
      .where(eq(projects.workspaceId, ctx.workspaceId))

    const counts = await db
      .select({ projectId: projectMembers.projectId, n: count() })
      .from(projectMembers)
      .groupBy(projectMembers.projectId)
    const countMap = new Map(counts.map(r => [r.projectId, Number(r.n)]))

    const memberRows = await db
      .select({
        projectId: projectMembers.projectId,
        displayName: profiles.displayName,
      })
      .from(projectMembers)
      .innerJoin(profiles, eq(projectMembers.userId, profiles.id))
      .orderBy(projectMembers.createdAt)
    const memberNamesMap = new Map<string, string[]>()
    for (const row of memberRows) {
      const names = memberNamesMap.get(row.projectId) ?? []
      if (names.length < 4) names.push(row.displayName)
      memberNamesMap.set(row.projectId, names)
    }

    const userMemberRows = await db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, ctx.userId))
    const userProjectIds = new Set(userMemberRows.map(r => r.projectId))

    const taskRows = await db
      .select({
        projectId: tasks.projectId,
        total: count(),
        completed: sql<number>`count(*) filter (where ${tasks.status} = 'done')`,
      })
      .from(tasks)
      .groupBy(tasks.projectId)
    const taskMap = new Map(taskRows.map(r => [r.projectId, { total: Number(r.total), completed: Number(r.completed) }]))

    const result: ProjectDto[] = rows.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      statusName: r.statusName ?? null,
      statusColor: r.statusColor ?? null,
      startDate: r.startDate,
      endDate: r.endDate,
      archived: r.archived,
      memberCount: countMap.get(r.id) ?? 0,
      memberNames: memberNamesMap.get(r.id) ?? [],
      taskCount: taskMap.get(r.id)?.total ?? 0,
      completedTaskCount: taskMap.get(r.id)?.completed ?? 0,
      isOwner: r.createdBy === ctx.userId,
      isMember: userProjectIds.has(r.id),
      coverPhotoIdx: coverPhotoIdxFromId(r.id),
      coverPhotoUrl: r.coverPhotoUrl ?? null,
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
    const newId = crypto.randomUUID()
    return NextResponse.json({
      id: newId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      statusName: null,
      statusColor: null,
      startDate: parsed.data.startDate ?? null,
      endDate: parsed.data.endDate ?? null,
      memberCount: 1,
      memberNames: [],
      taskCount: 0,
      completedTaskCount: 0,
      isOwner: true,
      isMember: true,
      archived: false,
      coverPhotoIdx: coverPhotoIdxFromId(newId),
      coverPhotoUrl: parsed.data.coverPhotoUrl ?? null,
    } satisfies ProjectDto, { status: 201 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { projects, channels, projectStatuses } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const [inserted] = await db
      .insert(projects)
      .values({
        workspaceId: ctx.workspaceId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        statusId: parsed.data.statusId ?? null,
        startDate: parsed.data.startDate ?? null,
        endDate: parsed.data.endDate ?? null,
        coverPhotoUrl: parsed.data.coverPhotoUrl ?? null,
        createdBy: ctx.userId,
      })
      .returning({ id: projects.id, title: projects.title, description: projects.description, startDate: projects.startDate, endDate: projects.endDate, coverPhotoUrl: projects.coverPhotoUrl })

    if (!inserted) throw new Error('Insert returned no rows')

    let statusName: string | null = null
    let statusColor: string | null = null
    if (parsed.data.statusId) {
      const [st] = await db
        .select({ name: projectStatuses.name, color: projectStatuses.color })
        .from(projectStatuses)
        .where(eq(projectStatuses.id, parsed.data.statusId))
        .limit(1)
      statusName = st?.name ?? null
      statusColor = st?.color ?? null
    }

    await db.insert(channels).values({
      workspaceId: ctx.workspaceId,
      projectId: inserted.id,
      type: 'project',
    })

    try {
      const { inngest } = await import('@/lib/inngest/client')
      await inngest.send({
        name: 'project/upserted',
        data: { projectId: inserted.id, workspaceId: ctx.workspaceId },
      })
    } catch (e) {
      console.warn('[/api/projects] Inngest event send failed (indexing skipped):', e)
    }

    return NextResponse.json({
      id: inserted.id,
      title: inserted.title,
      description: inserted.description,
      statusName,
      statusColor,
      startDate: inserted.startDate,
      endDate: inserted.endDate,
      memberCount: 1,
      memberNames: [],
      taskCount: 0,
      completedTaskCount: 0,
      isOwner: true,
      isMember: true,
      archived: false,
      coverPhotoIdx: coverPhotoIdxFromId(inserted.id),
      coverPhotoUrl: inserted.coverPhotoUrl ?? null,
    } satisfies ProjectDto, { status: 201 })
  } catch (err) {
    console.error('[/api/projects POST] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
