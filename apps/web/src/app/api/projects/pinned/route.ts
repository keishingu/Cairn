// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { PROJECTS, STATUS } from '@/components/app/data'
import type { ProjectDto } from '../route'

export interface PinnedProjectDto {
  id: string
  projectId: string
  title: string
  statusName: string
  dot: string
  sortOrder: number
}

function mockPinnedProjects(): PinnedProjectDto[] {
  return PROJECTS.slice(0, 4).map((p, i) => ({
    id: `mock-pin-${p.id}`,
    projectId: p.id,
    title: p.name,
    statusName: p.status,
    dot: STATUS[p.status].dot,
    sortOrder: i,
  }))
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json(mockPinnedProjects())
  }

  try {
    const { db } = await import('@cairn/db')
    const { pinnedProjects, projects, projectStatuses } = await import('@cairn/db')
    const { eq, and, asc } = await import('drizzle-orm')

    const rows = await db
      .select({
        id: pinnedProjects.id,
        projectId: pinnedProjects.projectId,
        sortOrder: pinnedProjects.sortOrder,
        title: projects.title,
        statusName: projectStatuses.name,
        statusColor: projectStatuses.color,
      })
      .from(pinnedProjects)
      .innerJoin(projects, eq(pinnedProjects.projectId, projects.id))
      .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
      .where(
        and(
          eq(pinnedProjects.userId, ctx.userId),
          eq(pinnedProjects.workspaceId, ctx.workspaceId),
        ),
      )
      .orderBy(asc(pinnedProjects.sortOrder), asc(pinnedProjects.pinnedAt))

    const result: PinnedProjectDto[] = rows.map(r => ({
      id: r.id,
      projectId: r.projectId,
      title: r.title,
      statusName: r.statusName ?? 'plan',
      dot: r.statusColor ?? '#3B82F6',
      sortOrder: r.sortOrder,
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/projects/pinned GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { projectId } = body as { projectId?: string }
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json({ ok: true }, { status: 201 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { pinnedProjects } = await import('@cairn/db')
    const { eq, and, count } = await import('drizzle-orm')

    const [existing] = await db
      .select({ n: count() })
      .from(pinnedProjects)
      .where(and(eq(pinnedProjects.userId, ctx.userId), eq(pinnedProjects.workspaceId, ctx.workspaceId)))

    const sortOrder = Number(existing?.n ?? 0)

    await db.insert(pinnedProjects).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      projectId,
      sortOrder,
    }).onConflictDoNothing()

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    console.error('[/api/projects/pinned POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { projectId } = body as { projectId?: string }
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json({ ok: true })
  }

  try {
    const { db } = await import('@cairn/db')
    const { pinnedProjects } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    await db
      .delete(pinnedProjects)
      .where(
        and(
          eq(pinnedProjects.userId, ctx.userId),
          eq(pinnedProjects.projectId, projectId),
          eq(pinnedProjects.workspaceId, ctx.workspaceId),
        ),
      )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/projects/pinned DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
