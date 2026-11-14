// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { assignProjectRoleSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const { id: projectId, userId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const forbidden = requireRole(ctx.role, 'member')
  if (forbidden) return forbidden

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = assignProjectRoleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const { db, projectMembers, projectRoles, projects } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const [role] = await db
      .select({
        id: projectRoles.id,
        name: projectRoles.name,
        color: projectRoles.color,
        sortOrder: projectRoles.sortOrder,
        legacyRole: projectRoles.legacyRole,
      })
      .from(projectRoles)
      .where(
        and(eq(projectRoles.id, parsed.data.roleId), eq(projectRoles.workspaceId, ctx.workspaceId)),
      )
    if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 422 })

    const [updated] = await db
      .update(projectMembers)
      .set({ roleId: role.id, role: role.legacyRole ?? 'member' })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .returning({ userId: projectMembers.userId })
    if (!updated) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

    try {
      const { inngest } = await import('@/lib/inngest/client')
      await inngest.send({
        name: 'project/upserted',
        data: { projectId, workspaceId: ctx.workspaceId },
      })
    } catch (eventError) {
      console.warn(
        '[PATCH /api/projects/[id]/members/[userId]] Inngest event send failed:',
        eventError,
      )
    }

    return NextResponse.json({
      userId: updated.userId,
      roleId: role.id,
      role: role.legacyRole ?? 'member',
      roleName: role.name,
      roleColor: role.color,
      roleSortOrder: role.sortOrder,
    })
  } catch (err) {
    console.error('[PATCH /api/projects/[id]/members/[userId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const { id: projectId, userId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db } = await import('@cairn/db')
    const { projectMembers, projects } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // 自分自身の退出は常に許可、他メンバーの削除は project manager 以上が必要
    if (userId !== ctx.userId) {
      const forbidden = requireRole(ctx.role, 'member')
      if (forbidden) return forbidden
    }

    const [deleted] = await db
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .returning({ id: projectMembers.id })

    if (!deleted) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/projects/[id]/members/[userId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
