// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

type RouteContext = { params: Promise<{ filterId: string }> }

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const { filterId } = await params

  try {
    const { db, savedFileFilters } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')

    const [deleted] = await db
      .delete(savedFileFilters)
      .where(
        and(
          eq(savedFileFilters.id, filterId),
          eq(savedFileFilters.workspaceId, ctx.workspaceId),
          eq(savedFileFilters.userId, ctx.userId),
        ),
      )
      .returning({ id: savedFileFilters.id })

    if (!deleted) return new NextResponse(null, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[/api/files/filters/[filterId] DELETE]', err)
    return NextResponse.json({ error: 'フィルターの削除に失敗しました' }, { status: 500 })
  }
}
