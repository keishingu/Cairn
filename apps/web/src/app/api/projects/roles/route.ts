// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { createProjectRoleSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'

export interface ProjectRoleDto {
  id: string
  name: string
  color: string
  sortOrder: number
  isDefault: boolean
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, projectRoles } = await import('@cairn/db')
    const { asc, eq } = await import('drizzle-orm')
    const rows = await db
      .select({
        id: projectRoles.id,
        name: projectRoles.name,
        color: projectRoles.color,
        sortOrder: projectRoles.sortOrder,
        legacyRole: projectRoles.legacyRole,
      })
      .from(projectRoles)
      .where(eq(projectRoles.workspaceId, ctx.workspaceId))
      .orderBy(asc(projectRoles.sortOrder), asc(projectRoles.name))

    return NextResponse.json(
      rows.map(
        (role) =>
          ({
            id: role.id,
            name: role.name,
            color: role.color,
            sortOrder: role.sortOrder,
            isDefault: role.legacyRole === 'member',
          }) satisfies ProjectRoleDto,
      ),
    )
  } catch (err) {
    console.error('[GET /api/projects/roles]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
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
  const parsed = createProjectRoleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const { db, projectRoles } = await import('@cairn/db')
    const { eq, max } = await import('drizzle-orm')
    const [maxRow] = await db
      .select({ value: max(projectRoles.sortOrder) })
      .from(projectRoles)
      .where(eq(projectRoles.workspaceId, ctx.workspaceId))
    const [inserted] = await db
      .insert(projectRoles)
      .values({
        workspaceId: ctx.workspaceId,
        name: parsed.data.name,
        color: parsed.data.color ?? '#6B7280',
        sortOrder: (maxRow?.value ?? 0) + 1,
      })
      .returning()

    if (!inserted) throw new Error('Insert returned no rows')
    return NextResponse.json(
      {
        id: inserted.id,
        name: inserted.name,
        color: inserted.color,
        sortOrder: inserted.sortOrder,
        isDefault: false,
      } satisfies ProjectRoleDto,
      { status: 201 },
    )
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === '23505') {
      return NextResponse.json({ error: '同じ名前の役割がすでにあります' }, { status: 409 })
    }
    console.error('[POST /api/projects/roles]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
