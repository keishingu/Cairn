// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { patchProjectStatusSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchProjectStatusSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }
  const b = parsed.data

  const forbidden = requireRole(ctx.role, 'admin')
  if (forbidden) return forbidden

  try {
    const { db } = await import('@cairn/db')
    const { projectStatuses } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    const set: { name?: string; color?: string; sortOrder?: string } = {}
    if (b.name !== undefined) set.name = b.name.trim()
    if (b.color !== undefined) set.color = b.color
    if (b.sortOrder !== undefined) set.sortOrder = b.sortOrder

    const [updated] = await db
      .update(projectStatuses)
      .set(set)
      .where(
        and(
          eq(projectStatuses.id, id),
          eq(projectStatuses.workspaceId, ctx.workspaceId),
        ),
      )
      .returning({ id: projectStatuses.id })

    if (!updated) {
      return NextResponse.json({ error: 'Status not found' }, { status: 404 })
    }

    return NextResponse.json({ id: updated.id })
  } catch (err) {
    console.error('[PATCH /api/projects/statuses/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  const forbidden = requireRole(ctx.role, 'admin')
  if (forbidden) return forbidden

  try {
    const { db } = await import('@cairn/db')
    const { projectStatuses, projects } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    // 使用中プロジェクトのstatusIdをnullにしてから削除
    await db
      .update(projects)
      .set({ statusId: null })
      .where(
        and(
          eq(projects.workspaceId, ctx.workspaceId),
          eq(projects.statusId, id),
        ),
      )

    const [deleted] = await db
      .delete(projectStatuses)
      .where(
        and(
          eq(projectStatuses.id, id),
          eq(projectStatuses.workspaceId, ctx.workspaceId),
        ),
      )
      .returning({ id: projectStatuses.id })

    if (!deleted) {
      return NextResponse.json({ error: 'Status not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/projects/statuses/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
