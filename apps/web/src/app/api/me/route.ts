// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { FEATURE_FLAGS, patchMeSchema } from '@cairn/shared'
import type { AccentId, AppearanceTheme } from '@cairn/shared'
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
  aiNudgesEnabled: boolean
  theme: AppearanceTheme
  accentId: AccentId
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
        aiNudgesEnabled: profiles.aiNudgesEnabled,
        theme: profiles.theme,
        accentId: profiles.accentId,
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
      aiNudgesEnabled: row.aiNudgesEnabled,
      theme: row.theme as AppearanceTheme,
      accentId: row.accentId as AccentId,
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
  if (!FEATURE_FLAGS.aiPmo && b.aiNudgesEnabled !== undefined) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const hasBio = 'bio' in b
  const hasStatusMessage = 'statusMessage' in b

  try {
    const { db, aiNudges, profiles, workspaceMembers } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    if (
      hasBio
      || b.aiNudgesEnabled !== undefined
      || b.theme !== undefined
      || b.accentId !== undefined
    ) {
      await db.transaction(async (tx) => {
        const profileUpdate: {
          bio?: string | null
          aiNudgesEnabled?: boolean
          theme?: AppearanceTheme
          accentId?: AccentId
          updatedAt: Date
        } = {
          updatedAt: new Date(),
        }
        if (hasBio) profileUpdate.bio = b.bio ?? null
        if (b.aiNudgesEnabled !== undefined) profileUpdate.aiNudgesEnabled = b.aiNudgesEnabled
        if (b.theme !== undefined) profileUpdate.theme = b.theme
        if (b.accentId !== undefined) profileUpdate.accentId = b.accentId

        await tx
          .update(profiles)
          .set(profileUpdate)
          .where(eq(profiles.id, ctx.userId))

        // キルスイッチ OFF はサーバー側で即時遡及させる。同じ suppressed 遷移を
        // フィードバック・アクセス失効と共有することで、DB trigger がベル通知も消す。
        if (b.aiNudgesEnabled === false) {
          await tx
            .update(aiNudges)
            .set({ status: 'suppressed', remindAfter: null })
            .where(and(
              eq(aiNudges.userId, ctx.userId),
              eq(aiNudges.status, 'active'),
            ))
          // 「あとで」の期限はOFF中も尊重し、再ONで早期復帰しないよう保持する。
          await tx
            .update(aiNudges)
            .set({ status: 'suppressed' })
            .where(and(
              eq(aiNudges.userId, ctx.userId),
              eq(aiNudges.status, 'dismissed'),
            ))
        }
      })
    }

    if (b.displayName !== undefined) {
      await db
        .update(workspaceMembers)
        .set({ displayName: b.displayName.trim() })
        .where(and(eq(workspaceMembers.userId, ctx.userId), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
    }

    if (b.status !== undefined || hasStatusMessage) {
      const set: { status?: UserStatus; statusMessage?: string | null } = {}
      if (b.status !== undefined) set.status = b.status
      if (hasStatusMessage) set.statusMessage = b.statusMessage?.trim() || null
      await db
        .update(workspaceMembers)
        .set(set)
        .where(and(eq(workspaceMembers.userId, ctx.userId), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
    }

    return NextResponse.json({
      id: ctx.userId,
      ...(b.theme !== undefined ? { theme: b.theme } : {}),
      ...(b.accentId !== undefined ? { accentId: b.accentId } : {}),
    })
  } catch (err) {
    console.error('[PATCH /api/me]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
