// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { patchProjectRoleSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const forbidden = requireRole(ctx.role, 'admin')
  if (forbidden) return forbidden

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = patchProjectRoleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const { db, projectRoles } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')
    const [updated] = await db
      .update(projectRoles)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(projectRoles.id, id), eq(projectRoles.workspaceId, ctx.workspaceId)))
      .returning({ id: projectRoles.id })

    if (!updated) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
    return NextResponse.json({ id: updated.id })
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === '23505') {
      return NextResponse.json({ error: '同じ名前の役割がすでにあります' }, { status: 409 })
    }
    console.error('[PATCH /api/projects/roles/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const forbidden = requireRole(ctx.role, 'admin')
  if (forbidden) return forbidden

  try {
    const { db, projectMembers, projectRoles } = await import('@cairn/db')
    const { and, count, eq } = await import('drizzle-orm')
    const [role] = await db
      .select({ legacyRole: projectRoles.legacyRole })
      .from(projectRoles)
      .where(and(eq(projectRoles.id, id), eq(projectRoles.workspaceId, ctx.workspaceId)))
    if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
    if (role.legacyRole === 'member') {
      return NextResponse.json({ error: 'デフォルトの役割は削除できません' }, { status: 409 })
    }

    const [usage] = await db
      .select({ value: count() })
      .from(projectMembers)
      .where(eq(projectMembers.roleId, id))
    if ((usage?.value ?? 0) > 0) {
      return NextResponse.json({ error: '使用中の役割は削除できません' }, { status: 409 })
    }

    await db
      .delete(projectRoles)
      .where(and(eq(projectRoles.id, id), eq(projectRoles.workspaceId, ctx.workspaceId)))
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/projects/roles/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
