// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export interface ProjectStatusDto {
  id: string
  name: string
  color: string
  sortOrder: string
}

function mockStatuses(): ProjectStatusDto[] {
  return [
    { id: '20000000-0000-0000-0000-000000000001', name: '計画中',     color: '#3B82F6', sortOrder: '1' },
    { id: '20000000-0000-0000-0000-000000000002', name: '審議中',     color: '#F59E0B', sortOrder: '2' },
    { id: '20000000-0000-0000-0000-000000000003', name: '実施待ち',   color: '#10B981', sortOrder: '3' },
    { id: '20000000-0000-0000-0000-000000000004', name: '実施中',     color: '#8B5CF6', sortOrder: '4' },
    { id: '20000000-0000-0000-0000-000000000005', name: '振り返り中', color: '#F43F5E', sortOrder: '5' },
    { id: '20000000-0000-0000-0000-000000000006', name: '完了',       color: '#6B7280', sortOrder: '6' },
  ]
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

  const { name, color = '#6B7280' } = body as {
    name?: string
    color?: string
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 422 })
  }

  if (!process.env['DATABASE_URL']) {
    const newId = crypto.randomUUID()
    const existing = mockStatuses()
    const sortOrder = String(existing.length + 1)
    return NextResponse.json({
      id: newId, name: name.trim(), color, sortOrder,
    } satisfies ProjectStatusDto, { status: 201 })
  }

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
        name: name.trim(),
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

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json(mockStatuses())
  }

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
    console.error('[/api/projects/statuses] DB query failed, using mock data:', err)
    return NextResponse.json(mockStatuses())
  }
}
