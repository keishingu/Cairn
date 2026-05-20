// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export interface ProjectStatusDto {
  id: string
  name: string
  color: string
  sortOrder: string
  isFinal: boolean
}

function mockStatuses(): ProjectStatusDto[] {
  return [
    { id: '20000000-0000-0000-0000-000000000001', name: 'plan',   color: '#3B82F6', sortOrder: '1', isFinal: false },
    { id: '20000000-0000-0000-0000-000000000002', name: 'review', color: '#F59E0B', sortOrder: '2', isFinal: false },
    { id: '20000000-0000-0000-0000-000000000003', name: 'wait',   color: '#10B981', sortOrder: '3', isFinal: false },
    { id: '20000000-0000-0000-0000-000000000004', name: 'doing',  color: '#8B5CF6', sortOrder: '4', isFinal: false },
    { id: '20000000-0000-0000-0000-000000000005', name: 'retro',  color: '#F43F5E', sortOrder: '5', isFinal: false },
    { id: '20000000-0000-0000-0000-000000000006', name: 'done',   color: '#6B7280', sortOrder: '6', isFinal: true },
  ]
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
        isFinal: projectStatuses.isFinal,
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
