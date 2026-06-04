// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export interface CurrentUserDto {
  id: string
  displayName: string
  avatarUrl: string | null
  email: string | null
  bio: string | null
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, profiles } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')
    const { createClient } = await import('@/lib/supabase/server')

    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const email = session?.user.email ?? null

    const { workspaceMembers } = await import('@cairn/db')
    const { and } = await import('drizzle-orm')

    const [row] = await db
      .select({
        id: profiles.id,
        displayName: profiles.displayName,
        globalAvatarUrl: profiles.avatarUrl,
        workspaceAvatarUrl: workspaceMembers.avatarUrl,
        bio: profiles.bio,
      })
      .from(profiles)
      .leftJoin(
        workspaceMembers,
        and(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.workspaceId, ctx.workspaceId)),
      )
      .where(eq(profiles.id, ctx.userId))

    if (!row) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: row.id,
      displayName: row.displayName,
      avatarUrl: row.workspaceAvatarUrl ?? row.globalAvatarUrl,
      email,
      bio: row.bio,
    } satisfies CurrentUserDto)
  } catch (err) {
    console.error('[/api/me] DB query failed:', err)
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

  const b = body as { displayName?: string; bio?: string | null }
  const hasDisplayName = b.displayName !== undefined
  const hasBio = 'bio' in (b as object)

  if (!hasDisplayName && !hasBio) {
    return NextResponse.json({ error: 'At least one field is required' }, { status: 422 })
  }
  if (hasDisplayName && !b.displayName?.trim()) {
    return NextResponse.json({ error: '表示名は必須です' }, { status: 422 })
  }

  try {
    const { db, profiles } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const set: { displayName?: string; bio?: string | null; updatedAt: Date } = { updatedAt: new Date() }
    if (hasDisplayName) set.displayName = b.displayName!.trim()
    if (hasBio) set.bio = b.bio ?? null

    await db.update(profiles).set(set).where(eq(profiles.id, ctx.userId))

    return NextResponse.json({ id: ctx.userId, ...b })
  } catch (err) {
    console.error('[PATCH /api/me]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
