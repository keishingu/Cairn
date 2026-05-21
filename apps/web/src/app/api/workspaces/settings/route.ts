// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export interface WorkspaceSettingsDto {
  projectLabel: string | null
}

function mockSettings(): WorkspaceSettingsDto {
  return { projectLabel: null }
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json(mockSettings())
  }

  try {
    const { db } = await import('@cairn/db')
    const { workspaces } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const [ws] = await db
      .select({ projectLabel: workspaces.projectLabel })
      .from(workspaces)
      .where(eq(workspaces.id, ctx.workspaceId))
      .limit(1)

    return NextResponse.json({ projectLabel: ws?.projectLabel ?? null } satisfies WorkspaceSettingsDto)
  } catch (err) {
    console.error('[/api/workspaces/settings] GET failed:', err)
    return NextResponse.json(mockSettings())
  }
}

export async function PATCH(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const body = await req.json() as Partial<WorkspaceSettingsDto>
  const projectLabel = typeof body.projectLabel === 'string'
    ? (body.projectLabel.trim() || null)
    : null

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json({ projectLabel })
  }

  try {
    const { db } = await import('@cairn/db')
    const { workspaces } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    await db
      .update(workspaces)
      .set({ projectLabel, updatedAt: new Date() })
      .where(eq(workspaces.id, ctx.workspaceId))

    return NextResponse.json({ projectLabel } satisfies WorkspaceSettingsDto)
  } catch (err) {
    console.error('[/api/workspaces/settings] PATCH failed:', err)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
