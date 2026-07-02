// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireWorkspaceOwner } from '@/lib/permissions'

const patchWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
})

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

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchWorkspaceSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'リクエストが不正です' }, { status: 422 })
  }
  const b = parsed.data
  const hasName = b.name !== undefined
  const hasDescription = 'description' in b
  const hasLogo = 'logoUrl' in b

  if (!hasName && !hasDescription && !hasLogo) {
    return NextResponse.json({ error: 'At least one field is required' }, { status: 422 })
  }
  if (hasName && !b.name?.trim()) {
    return NextResponse.json({ error: 'ワークスペース名は必須です' }, { status: 422 })
  }

  const forbidden = await requireWorkspaceOwner(ctx.workspaceId, ctx.userId)
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
