// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import type { TaskDto } from '../route'

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

  const { status } = body as { status?: TaskDto['status'] }
  if (!status || !['todo', 'in_progress', 'done'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 422 })
  }

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json({ id, status })
  }

  try {
    const { db } = await import('@cairn/db')
    const { tasks } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')
    const { getAuthContext } = await import('@/lib/get-auth-context')

    const { error } = await getAuthContext()
    if (error) return error

    const [updated] = await db
      .update(tasks)
      .set({ status })
      .where(eq(tasks.id, id))
      .returning({ id: tasks.id })

    if (!updated) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json({ id, status })
  } catch (err) {
    console.error('[PATCH /api/tasks/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
