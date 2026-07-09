// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { createMilestoneSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireProjectAccess, requireWorkspaceMember } from '@/lib/permissions'

export interface MilestoneDto {
  id: string
  projectId: string
  title: string
  description: string | null
  startDate: string | null
  endDate: string | null
  completed: boolean
  channelId: string
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const forbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, id)
  if (forbidden) return forbidden

  try {
    const { db, projects, milestones, channels } = await import('@cairn/db')
    const { eq, and, asc, sql } = await import('drizzle-orm')
    const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId))).limit(1)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const rows = await db.select({
      id: milestones.id,
      projectId: milestones.projectId,
      title: milestones.title,
      description: milestones.description,
      startDate: milestones.startDate,
      endDate: milestones.endDate,
      completed: milestones.completed,
      channelId: channels.id,
    }).from(milestones)
      .innerJoin(channels, eq(channels.milestoneId, milestones.id))
      .where(eq(milestones.projectId, id))
      .orderBy(sql`${milestones.startDate} asc nulls last`, asc(milestones.createdAt))
    return NextResponse.json(rows satisfies MilestoneDto[])
  } catch (err) {
    console.error('[GET /api/projects/[id]/milestones]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const forbidden = await requireWorkspaceMember(ctx.workspaceId, ctx.userId)
  if (forbidden) return forbidden

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = createMilestoneSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const { db, projects, milestones, channels } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')
    const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId))).limit(1)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const dto = await db.transaction(async (tx) => {
      const [milestone] = await tx.insert(milestones).values({
        projectId: id,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        startDate: parsed.data.startDate ?? null,
        endDate: parsed.data.endDate ?? null,
        createdBy: ctx.userId,
      }).returning()
      if (!milestone) throw new Error('Failed to create milestone')
      const [channel] = await tx.insert(channels).values({
        workspaceId: ctx.workspaceId,
        projectId: id,
        milestoneId: milestone.id,
        type: 'project',
        name: null,
      }).returning({ id: channels.id })
      if (!channel) throw new Error('Failed to create milestone channel')
      return { id: milestone.id, projectId: milestone.projectId, title: milestone.title, description: milestone.description, startDate: milestone.startDate, endDate: milestone.endDate, completed: milestone.completed, channelId: channel.id }
    })
    return NextResponse.json(dto satisfies MilestoneDto, { status: 201 })
  } catch (err) {
    console.error('[POST /api/projects/[id]/milestones]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
