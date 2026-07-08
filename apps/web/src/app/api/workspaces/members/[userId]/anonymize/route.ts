// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { getWorkspaceMemberRole, isWorkspaceAdmin } from '@/lib/permissions'

const ANONYMIZED_DISPLAY_NAME = '退会したユーザー'
const AVATAR_BUCKET = 'avatars'
const PUBLIC_BUCKET_SEGMENT = `/storage/v1/object/public/${AVATAR_BUCKET}/`

function extractAvatarPath(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null

  const publicIndex = avatarUrl.indexOf(PUBLIC_BUCKET_SEGMENT)
  if (publicIndex >= 0) {
    return avatarUrl.slice(publicIndex + PUBLIC_BUCKET_SEGMENT.length)
  }

  try {
    const url = new URL(avatarUrl)
    const marker = `${AVATAR_BUCKET}/`
    const markerIndex = url.pathname.indexOf(marker)
    if (markerIndex >= 0) {
      return url.pathname.slice(markerIndex + marker.length)
    }
  } catch {
    return null
  }

  return null
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId: targetUserId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, profiles, workspaceMembers } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')

    const callerRole = await getWorkspaceMemberRole(ctx.workspaceId, ctx.userId)
    if (!isWorkspaceAdmin(callerRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [memberInWorkspace] = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, targetUserId)))
      .limit(1)

    if (!memberInWorkspace) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const avatarRows = await db
      .select({ avatarUrl: workspaceMembers.avatarUrl })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, targetUserId))

    const avatarPaths = [...new Set(
      avatarRows
        .map(row => extractAvatarPath(row.avatarUrl ?? null))
        .filter((path): path is string => Boolean(path)),
    )]

    if (avatarPaths.length > 0) {
      const { createServiceRoleClient } = await import('@/lib/supabase/service')
      const supabase = createServiceRoleClient()
      const { error: storageError } = await supabase.storage.from(AVATAR_BUCKET).remove(avatarPaths)
      if (storageError) {
        console.error('[POST /api/workspaces/members/[userId]/anonymize] Storage remove failed:', storageError)
        return NextResponse.json({ error: 'Avatar cleanup failed' }, { status: 500 })
      }
    }

    const now = new Date()

    await db
      .update(profiles)
      .set({
        displayName: ANONYMIZED_DISPLAY_NAME,
        bio: null,
        icalToken: null,
        updatedAt: now,
      })
      .where(eq(profiles.id, targetUserId))

    await db
      .update(workspaceMembers)
      .set({
        displayName: null,
        avatarUrl: null,
        membershipStatus: 'inactive',
        deactivatedAt: now,
        deactivatedBy: ctx.userId,
        status: 'offline',
        statusMessage: null,
      })
      .where(eq(workspaceMembers.userId, targetUserId))

    return NextResponse.json({ userId: targetUserId, anonymized: true })
  } catch (err) {
    console.error('[POST /api/workspaces/members/[userId]/anonymize]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
