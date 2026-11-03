// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/get-auth-context'

/**
 * 外部アプリへの許可を取り消す。次にその外部アプリでログインするときは同意画面が出る。
 * 交換前のコードと UserInfo 用のアクセストークンもその場で破棄する。発行済みの ID トークンは5分で切れる（docs/oidc-design.md §8）
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { userId, error } = await getAuthUser()
  if (error) return error
  const { clientId } = await params

  try {
    const { db, oidcAccessTokens, oidcAuthorizationCodes, oidcGrants } = await import('@cairn/db')
    const { and, eq, isNull } = await import('drizzle-orm')
    // 許可の取り消しと同時に、まだ交換されていないコードと UserInfo 用トークンも消す
    const revoked = await db.transaction(async (tx) => {
      const rows = await tx
        .update(oidcGrants)
        .set({ revokedAt: new Date() })
        .where(and(eq(oidcGrants.userId, userId), eq(oidcGrants.clientId, clientId), isNull(oidcGrants.revokedAt)))
        .returning({ id: oidcGrants.id })
      if (rows.length === 0) return rows
      await tx
        .delete(oidcAuthorizationCodes)
        .where(and(eq(oidcAuthorizationCodes.userId, userId), eq(oidcAuthorizationCodes.clientId, clientId)))
      await tx
        .delete(oidcAccessTokens)
        .where(and(eq(oidcAccessTokens.userId, userId), eq(oidcAccessTokens.clientId, clientId)))
      return rows
    })
    if (revoked.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return new NextResponse(null, { status: 204 })
  } catch (dbError) {
    console.error('[DELETE /api/oidc/grants/[clientId]]', dbError)
    return NextResponse.json({ error: 'Could not revoke access for this app' }, { status: 500 })
  }
}
