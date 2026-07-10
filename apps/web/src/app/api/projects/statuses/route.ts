// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { createProjectStatusSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireWorkspaceAdmin } from '@/lib/permissions'

export interface ProjectStatusDto {
  id: string
  name: string
  color: string
  sortOrder: string
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

  const parsed = createProjectStatusSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }
  const { name, color = '#6B7280' } = parsed.data

  const forbidden = await requireWorkspaceAdmin(ctx.workspaceId, ctx.userId)
  if (forbidden) return forbidden

  try {
    const { db } = await import('@cairn/db')
    const { projectStatuses } = await import('@cairn/db')
    const { eq, max } = await import('drizzle-orm')
    const { sql } = await import('drizzle-orm')

    const [maxRow] = await db
      .select({ m: max(sql<string>`${projectStatuses.sortOrder}::int`) })
      .from(projectStatuses)
      .where(eq(projectStatuses.workspaceId, ctx.workspaceId))

    const nextOrder = String((Number(maxRow?.m ?? 0)) + 1)

    const [inserted] = await db
      .insert(projectStatuses)
      .values({
        workspaceId: ctx.workspaceId,
        name,
        color,
        sortOrder: nextOrder,
      })
      .returning()

    if (!inserted) throw new Error('Insert returned no rows')

    return NextResponse.json({
      id: inserted.id,
      name: inserted.name,
      color: inserted.color,
      sortOrder: inserted.sortOrder,
    } satisfies ProjectStatusDto, { status: 201 })
  } catch (err) {
    console.error('[POST /api/projects/statuses]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  try {
    const { db } = await import('@cairn/db')
    const { projectStatuses } = await import('@cairn/db')
    const { eq, asc } = await import('drizzle-orm')

    const rows = await db
      .select({
        id: projectStatuses.id,
        name: projectStatuses.name,
        color: projectStatuses.color,
        sortOrder: projectStatuses.sortOrder,
      })
      .from(projectStatuses)
      .where(eq(projectStatuses.workspaceId, ctx.workspaceId))
      .orderBy(asc(projectStatuses.sortOrder))

    return NextResponse.json(rows satisfies ProjectStatusDto[])
  } catch (err) {
    console.error('[/api/projects/statuses] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
