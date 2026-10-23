// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import type { ApiTokenScope } from '@/lib/api-tokens'

export interface McpOAuthConnectionDto {
  id: string
  clientName: string
  scope: ApiTokenScope
  createdAt: string
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, mcpOAuthClients, mcpOAuthConnections } = await import('@cairn/db')
    const { and, desc, eq, isNull } = await import('drizzle-orm')
    const rows = await db
      .select({
        id: mcpOAuthConnections.id,
        clientName: mcpOAuthClients.clientName,
        scope: mcpOAuthConnections.scope,
        createdAt: mcpOAuthConnections.createdAt,
      })
      .from(mcpOAuthConnections)
      .innerJoin(mcpOAuthClients, eq(mcpOAuthClients.clientId, mcpOAuthConnections.clientId))
      .where(
        and(
          eq(mcpOAuthConnections.userId, ctx.userId),
          eq(mcpOAuthConnections.workspaceId, ctx.workspaceId),
          isNull(mcpOAuthConnections.revokedAt),
        ),
      )
      .orderBy(desc(mcpOAuthConnections.createdAt))

    return NextResponse.json(
      rows.map(
        (row) =>
          ({ ...row, createdAt: row.createdAt.toISOString() }) satisfies McpOAuthConnectionDto,
      ),
    )
  } catch (error) {
    console.error('[GET /api/oauth/connections]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
