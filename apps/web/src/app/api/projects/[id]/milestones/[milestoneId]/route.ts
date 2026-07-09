// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { patchMilestoneSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireWorkspaceMember } from '@/lib/permissions'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; milestoneId: string }> }) {
  const { id, milestoneId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const forbidden = await requireWorkspaceMember(ctx.workspaceId, ctx.userId)
  if (forbidden) return forbidden
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = patchMilestoneSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const { db, projects, milestones } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')
    const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId))).limit(1)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const b = parsed.data
    const [updated] = await db.update(milestones).set({
      ...(b.title !== undefined ? { title: b.title } : {}),
      ...('description' in b ? { description: b.description ?? null } : {}),
      ...('startDate' in b ? { startDate: b.startDate ?? null } : {}),
      ...('endDate' in b ? { endDate: b.endDate ?? null } : {}),
      ...(b.completed !== undefined ? { completed: b.completed } : {}),
      updatedAt: new Date(),
    }).where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, id))).returning()
    if (!updated) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('[PATCH /api/projects/[id]/milestones/[milestoneId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; milestoneId: string }> }) {
  const { id, milestoneId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const forbidden = await requireWorkspaceMember(ctx.workspaceId, ctx.userId)
  if (forbidden) return forbidden
  try {
    const { db, projects, milestones } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')
    const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId))).limit(1)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const [deleted] = await db.delete(milestones).where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, id))).returning({ id: milestones.id })
    if (!deleted) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/projects/[id]/milestones/[milestoneId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
