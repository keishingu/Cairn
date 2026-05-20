// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import type { StatusKey } from '@/components/app/data'
import type { ProjectDto } from '../route'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { statusName } = body as { statusName?: StatusKey }
  if (!statusName) {
    return NextResponse.json({ error: 'statusName is required' }, { status: 422 })
  }

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json({ id, statusName } satisfies Partial<ProjectDto>)
  }

  try {
    const { db } = await import('@cairn/db')
    const { projects, projectStatuses } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')
    const { getAuthContext } = await import('@/lib/get-auth-context')

    const { ctx, error } = await getAuthContext()
    if (error) return error

    const [status] = await db
      .select({ id: projectStatuses.id })
      .from(projectStatuses)
      .where(
        and(
          eq(projectStatuses.workspaceId, ctx.workspaceId),
          eq(projectStatuses.name, statusName),
        ),
      )

    if (!status) {
      return NextResponse.json({ error: 'Status not found' }, { status: 404 })
    }

    const [updated] = await db
      .update(projects)
      .set({ statusId: status.id })
      .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId)))
      .returning({ id: projects.id })

    if (!updated) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({ id, statusName } satisfies Partial<ProjectDto>)
  } catch (err) {
    console.error('[PATCH /api/projects/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
