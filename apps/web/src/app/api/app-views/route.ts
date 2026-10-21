// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export interface AppViewDto {
  id: string
  /** views.update で変わる。クライアントはこれが変わったら入力状態を作り直す */
  hash: string
  view: unknown
  appName: string
  appIconUrl: string | null
}

// 自分に開かれているモーダル（新しい順）。アプリが views.open すると Realtime で本人のトピックへ知らされ、クライアントがこれを取り直す
export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  try {
    const { db, appViews, appInstallations, apps } = await import('@cairn/db')
    const { and, desc, eq, isNull } = await import('drizzle-orm')
    const rows = await db
      .select({ id: appViews.id, hash: appViews.hash, view: appViews.view, appName: apps.name, appIconUrl: apps.iconUrl })
      .from(appViews)
      .innerJoin(appInstallations, eq(appInstallations.id, appViews.installationId))
      .innerJoin(apps, eq(apps.id, appInstallations.appId))
      .where(and(eq(appViews.userId, ctx.userId), eq(appViews.status, 'open'), eq(appInstallations.workspaceId, ctx.workspaceId), isNull(appInstallations.revokedAt)))
      .orderBy(desc(appViews.createdAt))
      .limit(10)
    return NextResponse.json(rows satisfies AppViewDto[])
  } catch (err) {
    console.error('[/api/app-views GET] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
