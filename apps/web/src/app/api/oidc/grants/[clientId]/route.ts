// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/get-auth-context'

/**
 * 外部アプリへの許可を取り消す。次にその外部アプリでログインするときは同意画面が出る。
 * 発行済みの ID トークンとアクセストークンは5分で切れる（docs/oidc-design.md §8）
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { userId, error } = await getAuthUser()
  if (error) return error
  const { clientId } = await params

  try {
    const { db, oidcGrants } = await import('@cairn/db')
    const { and, eq, isNull } = await import('drizzle-orm')
    const revoked = await db
      .update(oidcGrants)
      .set({ revokedAt: new Date() })
      .where(and(eq(oidcGrants.userId, userId), eq(oidcGrants.clientId, clientId), isNull(oidcGrants.revokedAt)))
      .returning({ id: oidcGrants.id })
    if (revoked.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return new NextResponse(null, { status: 204 })
  } catch (dbError) {
    console.error('[DELETE /api/oidc/grants/[clientId]]', dbError)
    return NextResponse.json({ error: 'Could not revoke access for this app' }, { status: 500 })
  }
}
