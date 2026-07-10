// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { patchMeSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'
import type { UserStatus } from '@/lib/user-status'

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
        displayName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
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

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchMeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }
  const b = parsed.data

  const hasBio = 'bio' in b
  const hasStatusMessage = 'statusMessage' in b

  try {
    const { db, profiles, workspaceMembers } = await import('@cairn/db')
    const { eq, and, sql } = await import('drizzle-orm')

    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql`
        select 1
        from workspace_members
        where workspace_id = ${ctx.workspaceId}
          and user_id = ${ctx.userId}
          and membership_status = 'active'
        for update
      `)

      const [activeMember] = await tx
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(and(
          eq(workspaceMembers.userId, ctx.userId),
          eq(workspaceMembers.workspaceId, ctx.workspaceId),
          eq(workspaceMembers.membershipStatus, 'active'),
        ))
        .limit(1)

      if (!activeMember) {
        return false
      }

      if (hasBio) {
        await tx
          .update(profiles)
          .set({ bio: b.bio ?? null, updatedAt: new Date() })
          .where(eq(profiles.id, ctx.userId))
      }

      if (b.displayName !== undefined) {
        await tx
          .update(workspaceMembers)
          .set({ displayName: b.displayName.trim() })
          .where(and(eq(workspaceMembers.userId, ctx.userId), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
      }

      if (b.status !== undefined || hasStatusMessage) {
        const set: { status?: UserStatus; statusMessage?: string | null } = {}
        if (b.status !== undefined) set.status = b.status
        if (hasStatusMessage) set.statusMessage = b.statusMessage?.trim() || null
        await tx
          .update(workspaceMembers)
          .set(set)
          .where(and(eq(workspaceMembers.userId, ctx.userId), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
      }

      return true
    })

    if (!updated) {
      return NextResponse.json({ error: '非アクティブなメンバーはプロフィールを更新できません' }, { status: 409 })
    }

    return NextResponse.json({ id: ctx.userId })
  } catch (err) {
    console.error('[PATCH /api/me]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
