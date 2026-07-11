// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { patchWorkspaceSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireWorkspaceOwner } from '@/lib/permissions'

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

  const parsed = patchWorkspaceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }
  const b = parsed.data

  const forbidden = await requireWorkspaceOwner(ctx.workspaceId, ctx.userId)
  if (forbidden) return forbidden

  try {
    const { db, workspaces } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const set: { name?: string; description?: string | null; logoUrl?: string | null; updatedAt: Date } = { updatedAt: new Date() }
    if (b.name !== undefined) set.name = b.name.trim()
    if ('description' in b) set.description = b.description ?? null
    if ('logoUrl' in b) set.logoUrl = b.logoUrl ?? null

    const [updated] = await db
      .update(workspaces)
      .set(set)
      .where(eq(workspaces.id, ctx.workspaceId))
      .returning({ id: workspaces.id })

    if (!updated) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    return NextResponse.json({ id: updated.id })
  } catch (err) {
    console.error('[PATCH /api/workspaces]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
