// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

type RouteContext = { params: Promise<{ userId: string }> }
export async function DELETE(_req: Request, { params }: RouteContext) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const { userId } = await params
  const { db, userBlocks } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')
  await db.delete(userBlocks).where(and(eq(userBlocks.blockerId, ctx.userId), eq(userBlocks.blockedId, userId)))
  return new NextResponse(null, { status: 204 })
}
