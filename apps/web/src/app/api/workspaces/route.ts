// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireWorkspaceAdmin } from '@/lib/permissions'

export interface WorkspaceDto {
  id: string
  name: string
  slug: string
  description: string | null
  logoUrl: string | null
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, workspaces } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const [ws] = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        description: workspaces.description,
        logoUrl: workspaces.logoUrl,
      })
      .from(workspaces)
      .where(eq(workspaces.id, ctx.workspaceId))

    if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    return NextResponse.json(ws satisfies WorkspaceDto)
  } catch (err) {
    console.error('[GET /api/workspaces]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const b = body as { name?: string; description?: string | null; logoUrl?: string | null }
  const hasName = b.name !== undefined
  const hasDescription = 'description' in (b as object)
  const hasLogo = 'logoUrl' in (b as object)

  if (!hasName && !hasDescription && !hasLogo) {
    return NextResponse.json({ error: 'At least one field is required' }, { status: 422 })
  }
  if (hasName && !b.name?.trim()) {
    return NextResponse.json({ error: 'ワークスペース名は必須です' }, { status: 422 })
  }

  const forbidden = await requireWorkspaceAdmin(ctx.workspaceId, ctx.userId)
  if (forbidden) return forbidden

  try {
    const { db, workspaces } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const set: { name?: string; description?: string | null; logoUrl?: string | null; updatedAt: Date } = { updatedAt: new Date() }
    if (hasName) set.name = b.name!.trim()
    if (hasDescription) set.description = b.description ?? null
    if (hasLogo) set.logoUrl = b.logoUrl ?? null

    const [updated] = await db
      .update(workspaces)
      .set(set)
      .where(eq(workspaces.id, ctx.workspaceId))
      .returning({ id: workspaces.id })

    if (!updated) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    return NextResponse.json({ id: ctx.workspaceId, ...b })
  } catch (err) {
    console.error('[PATCH /api/workspaces]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
