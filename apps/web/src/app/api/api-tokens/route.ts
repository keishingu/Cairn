// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'
import {
  API_TOKEN_DEFAULT_DAYS,
  API_TOKEN_MAX_DAYS,
  createApiToken,
  type ApiTokenScope,
} from '@/lib/api-tokens'

export interface ApiTokenDto {
  id: string
  name: string
  prefix: string
  scope: ApiTokenScope
  expiresAt: string
  revokedAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scope: z.enum(['read', 'write']).default('read'),
  expiresInDays: z.number().int().min(1).max(API_TOKEN_MAX_DAYS).default(API_TOKEN_DEFAULT_DAYS),
})

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, apiTokens } = await import('@cairn/db')
    const { and, desc, eq } = await import('drizzle-orm')
    const rows = await db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        prefix: apiTokens.tokenPrefix,
        scope: apiTokens.scope,
        expiresAt: apiTokens.expiresAt,
        revokedAt: apiTokens.revokedAt,
        lastUsedAt: apiTokens.lastUsedAt,
        createdAt: apiTokens.createdAt,
      })
      .from(apiTokens)
      .where(and(eq(apiTokens.userId, ctx.userId), eq(apiTokens.workspaceId, ctx.workspaceId)))
      .orderBy(desc(apiTokens.createdAt))

    const result: ApiTokenDto[] = rows.map((row) => ({
      ...row,
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }))
    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/api-tokens]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const forbidden = requireRole(ctx.role, 'member')
  if (forbidden) return forbidden

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const { db, apiTokens } = await import('@cairn/db')
    const generated = createApiToken()
    const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
    const [row] = await db
      .insert(apiTokens)
      .values({
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        name: parsed.data.name,
        tokenHash: generated.hash,
        tokenPrefix: generated.prefix,
        scope: parsed.data.scope,
        expiresAt,
      })
      .returning({
        id: apiTokens.id,
        name: apiTokens.name,
        prefix: apiTokens.tokenPrefix,
        scope: apiTokens.scope,
        expiresAt: apiTokens.expiresAt,
        createdAt: apiTokens.createdAt,
      })
    if (!row) throw new Error('Insert returned no rows')

    return NextResponse.json(
      {
        token: generated.token,
        apiToken: {
          ...row,
          expiresAt: row.expiresAt.toISOString(),
          createdAt: row.createdAt.toISOString(),
          revokedAt: null,
          lastUsedAt: null,
        } satisfies ApiTokenDto,
      },
      { status: 201 },
    )
  } catch (err) {
    console.error('[POST /api/api-tokens]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
