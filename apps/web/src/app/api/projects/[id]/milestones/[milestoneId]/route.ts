// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { patchMilestoneSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireWorkspaceMember } from '@/lib/permissions'
import type { MilestoneDto } from '../route'

type RouteContext = { params: Promise<{ id: string; milestoneId: string }> }

export async function PATCH(req: Request, { params }: RouteContext) {
  const { id: projectId, milestoneId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchMilestoneSchema.safeParse(body)
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

    const forbidden = await requireWorkspaceMember(ctx.workspaceId, ctx.userId)
    if (forbidden) return forbidden

    const set: {
      title?: string
      description?: string | null
      startDate?: string | null
      endDate?: string | null
      completed?: boolean
      updatedAt: Date
    } = { updatedAt: new Date() }

    if (parsed.data.title !== undefined) set.title = parsed.data.title
    if ('description' in parsed.data) set.description = parsed.data.description ?? null
    if ('startDate' in parsed.data) set.startDate = parsed.data.startDate ?? null
    if ('endDate' in parsed.data) set.endDate = parsed.data.endDate ?? null
    if (parsed.data.completed !== undefined) set.completed = parsed.data.completed

    const [updated] = await db
      .update(milestones)
      .set(set)
      .where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)))
      .returning()

    if (!updated) return new NextResponse(null, { status: 404 })

    const [channel] = await db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.milestoneId, milestoneId))
      .limit(1)

    if (!channel) throw new Error('milestone channel not found')

    return NextResponse.json({
      id: updated.id,
      projectId: updated.projectId,
      title: updated.title,
      description: updated.description,
      startDate: updated.startDate,
      endDate: updated.endDate,
      completed: updated.completed,
      channelId: channel.id,
    } satisfies MilestoneDto)
  } catch (err) {
    console.error('[/api/projects/[id]/milestones/[milestoneId] PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id: projectId, milestoneId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, milestones, projects } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!project) return new NextResponse(null, { status: 404 })

    const forbidden = await requireWorkspaceMember(ctx.workspaceId, ctx.userId)
    if (forbidden) return forbidden

    const [deleted] = await db
      .delete(milestones)
      .where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)))
      .returning({ id: milestones.id })

    if (!deleted) return new NextResponse(null, { status: 404 })

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[/api/projects/[id]/milestones/[milestoneId] DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
