// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const { id } = await params

  try {
    const { db, mcpOAuthConnections } = await import('@cairn/db')
    const { and, eq, isNull } = await import('drizzle-orm')
    const [revoked] = await db
      .update(mcpOAuthConnections)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(mcpOAuthConnections.id, id),
          eq(mcpOAuthConnections.userId, ctx.userId),
          eq(mcpOAuthConnections.workspaceId, ctx.workspaceId),
          isNull(mcpOAuthConnections.revokedAt),
        ),
      )
      .returning({ id: mcpOAuthConnections.id })
    if (!revoked) return NextResponse.json({ error: 'OAuth connection not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/oauth/connections/[id]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
