// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireWorkspaceOwner } from '@/lib/permissions'
import type { WorkspaceSettings } from '@cairn/db'

export type { WorkspaceSettings as WorkspaceSettingsDto }

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db } = await import('@cairn/db')
    const { workspaces } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const [ws] = await db
      .select({ settings: workspaces.settings })
      .from(workspaces)
      .where(eq(workspaces.id, ctx.workspaceId))
      .limit(1)

    return NextResponse.json((ws?.settings ?? {}) satisfies WorkspaceSettings)
  } catch (err) {
    console.error('[/api/workspaces/settings] GET failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const forbidden = await requireWorkspaceOwner(ctx.workspaceId, ctx.userId)
  if (forbidden) return forbidden

  const patch = await req.json() as Partial<WorkspaceSettings>

  try {
    const { db } = await import('@cairn/db')
    const { workspaces } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    // 既存の settings を取得してシャローマージ
    const [ws] = await db
      .select({ settings: workspaces.settings })
      .from(workspaces)
      .where(eq(workspaces.id, ctx.workspaceId))
      .limit(1)

    const merged: WorkspaceSettings = { ...(ws?.settings ?? {}), ...patch }

    await db
      .update(workspaces)
      .set({ settings: merged, updatedAt: new Date() })
      .where(eq(workspaces.id, ctx.workspaceId))

    return NextResponse.json(merged satisfies WorkspaceSettings)
  } catch (err) {
    console.error('[/api/workspaces/settings] PATCH failed:', err)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
