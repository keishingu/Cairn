// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { findOpenAppView } from '@/lib/apps/app-views'

// 利用者がモーダルを閉じた。第1段階は view_closed をアプリへ送らない（notify_on_close は未対応）
export async function POST(_req: Request, { params }: { params: Promise<{ viewId: string }> }) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const { viewId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(viewId)) return NextResponse.json({ error: 'view_not_found' }, { status: 404 })
  try {
    const view = await findOpenAppView({ viewId, userId: ctx.userId, workspaceId: ctx.workspaceId })
    if (!view) return NextResponse.json({ error: 'view_not_found' }, { status: 404 })
    const { db, appViews } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')
    await db.update(appViews).set({ status: 'closed' }).where(and(eq(appViews.id, viewId), eq(appViews.status, 'open')))
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/app-views/[viewId]/close POST] failed:', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
