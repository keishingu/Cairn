// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/get-auth-context'

export interface OidcGrantDto {
  clientId: string
  clientName: string
  scope: string
  grantedAt: string
}

/**
 * 利用者が「Cairn でログイン」で許可した外部アプリの一覧（設定の「連携」）。
 * 許可はワークスペースではなく利用者本人に属するので、ワークスペースを問わない getAuthUser で本人を確かめる
 */
export async function GET() {
  const { userId, error } = await getAuthUser()
  if (error) return error

  try {
    const { db, oidcClients, oidcGrants } = await import('@cairn/db')
    const { and, desc, eq, isNull } = await import('drizzle-orm')
    const rows = await db
      .select({
        clientId: oidcGrants.clientId,
        clientName: oidcClients.clientName,
        scope: oidcGrants.scope,
        grantedAt: oidcGrants.grantedAt,
      })
      .from(oidcGrants)
      .innerJoin(oidcClients, eq(oidcClients.clientId, oidcGrants.clientId))
      .where(and(eq(oidcGrants.userId, userId), isNull(oidcGrants.revokedAt)))
      .orderBy(desc(oidcGrants.grantedAt))
    return NextResponse.json(
      rows.map((row): OidcGrantDto => ({ ...row, grantedAt: row.grantedAt.toISOString() })),
    )
  } catch (dbError) {
    console.error('[GET /api/oidc/grants]', dbError)
    return NextResponse.json({ error: 'Could not load apps that use Sign in with Cairn' }, { status: 500 })
  }
}
