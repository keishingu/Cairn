// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { createMilestoneSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireProjectAccess, requireRole } from '@/lib/permissions'

export interface MilestoneDto {
  id: string
  projectId: string
  title: string
  description: string | null
  startDate: string | null
  endDate: string | null
  startTime: string | null
  endTime: string | null
  completed: boolean
  channelId: string
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const { id: projectId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, channels, milestones, projects } = await import('@cairn/db')
    const { and, eq, sql } = await import('drizzle-orm')

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!project) return new NextResponse(null, { status: 404 })

    const forbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, projectId, ctx.role)
    if (forbidden) return forbidden

    const rows = await db
      .select({
        id: milestones.id,
        projectId: milestones.projectId,
        title: milestones.title,
        description: milestones.description,
        startDate: milestones.startDate,
        endDate: milestones.endDate,
        startTime: milestones.startTime,
        endTime: milestones.endTime,
        completed: milestones.completed,
        channelId: channels.id,
      })
      .from(milestones)
      .innerJoin(channels, eq(channels.milestoneId, milestones.id))
      .where(eq(milestones.projectId, projectId))
      .orderBy(sql`${milestones.startDate} asc nulls last`, milestones.createdAt)

    return NextResponse.json(rows satisfies MilestoneDto[])
  } catch (err) {
    console.error('[/api/projects/[id]/milestones GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  const { id: projectId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createMilestoneSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const { db, channels, milestones, projects } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!project) return new NextResponse(null, { status: 404 })

    const forbidden = requireRole(ctx.role, 'member')
    if (forbidden) return forbidden

    const inserted = await db.transaction(async (tx) => {
      const [milestone] = await tx
        .insert(milestones)
        .values({
          projectId,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          startDate: parsed.data.startDate ?? null,
          endDate: parsed.data.endDate ?? null,
          startTime: parsed.data.startTime ?? null,
          endTime: parsed.data.endTime ?? null,
          createdBy: ctx.userId,
        })
        .returning()

      if (!milestone) throw new Error('milestones insert returned no rows')

      const [channel] = await tx
        .insert(channels)
        .values({
          workspaceId: ctx.workspaceId,
          projectId,
          milestoneId: milestone.id,
          type: 'project',
          name: null,
          isPrivate: false,
        })
        .returning({ id: channels.id })

      if (!channel) throw new Error('channels insert returned no rows')

      return { milestone, channelId: channel.id }
    })

    const result: MilestoneDto = {
      id: inserted.milestone.id,
      projectId: inserted.milestone.projectId,
      title: inserted.milestone.title,
      description: inserted.milestone.description,
      startDate: inserted.milestone.startDate,
      endDate: inserted.milestone.endDate,
      startTime: inserted.milestone.startTime,
      endTime: inserted.milestone.endTime,
      completed: inserted.milestone.completed,
      channelId: inserted.channelId,
    }

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('[/api/projects/[id]/milestones POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
