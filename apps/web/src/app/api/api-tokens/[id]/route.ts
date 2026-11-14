// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const { id } = await params

  try {
    const { db, apiTokens } = await import('@cairn/db')
    const { and, eq, isNull } = await import('drizzle-orm')
    const [revoked] = await db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(apiTokens.id, id),
          eq(apiTokens.userId, ctx.userId),
          eq(apiTokens.workspaceId, ctx.workspaceId),
          isNull(apiTokens.revokedAt),
        ),
      )
      .returning({ id: apiTokens.id })

    if (!revoked) return NextResponse.json({ error: 'API token not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/api-tokens/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
