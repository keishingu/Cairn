// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { USER_STATUSES, type UserStatus } from '@/lib/user-status'

const patchMeSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  bio: z.string().max(1000).nullable().optional(),
  status: z.enum(['online', 'away', 'busy', 'offline']).optional(),
  statusMessage: z.string().max(100).nullable().optional(),
}).refine(
  d => d.displayName !== undefined || 'bio' in d || d.status !== undefined || 'statusMessage' in d,
  { message: 'At least one field is required' },
)

export interface CurrentUserDto {
  id: string
  displayName: string
  avatarUrl: string | null
  email: string | null
  bio: string | null
  status: UserStatus
  statusMessage: string | null
  wsRole: 'owner' | 'admin' | 'member' | 'guest'
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
        avatarUrl: workspaceMembers.avatarUrl,
        bio: profiles.bio,
        status: workspaceMembers.status,
        statusMessage: workspaceMembers.statusMessage,
        wsRole: workspaceMembers.role,
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
      avatarUrl: row.avatarUrl ?? null,
      email,
      bio: row.bio,
      status: row.status ?? 'online',
      statusMessage: row.statusMessage ?? null,
      wsRole: row.wsRole ?? 'member',
    } satisfies CurrentUserDto)
  } catch (err) {
    console.error('[/api/me] DB query failed:', err)
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

  const parsed = patchMeSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }
  const b = parsed.data
  const hasDisplayName = b.displayName !== undefined
  const hasBio = 'bio' in b
  const hasStatus = b.status !== undefined
  const hasStatusMessage = 'statusMessage' in b

  try {
    const { db, profiles, workspaceMembers } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    if (hasDisplayName || hasBio) {
      const set: { displayName?: string; bio?: string | null; updatedAt: Date } = { updatedAt: new Date() }
      if (hasDisplayName) set.displayName = b.displayName!.trim()
      if (hasBio) set.bio = b.bio ?? null
      await db.update(profiles).set(set).where(eq(profiles.id, ctx.userId))
    }

    if (hasStatus || hasStatusMessage) {
      const set: { status?: UserStatus; statusMessage?: string | null } = {}
      if (hasStatus) set.status = b.status!
      if (hasStatusMessage) set.statusMessage = b.statusMessage?.trim() || null
      await db
        .update(workspaceMembers)
        .set(set)
        .where(and(eq(workspaceMembers.userId, ctx.userId), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
    }

    return NextResponse.json({ id: ctx.userId, ...b })
  } catch (err) {
    console.error('[PATCH /api/me]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
