// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { clearWorkspaceCacheForUser, getAuthContext } from '@/lib/get-auth-context'
import { getWorkspaceMemberRole, isWorkspaceAdmin } from '@/lib/permissions'

const ANONYMIZED_DISPLAY_NAME = '退会したユーザー'
const AVATAR_BUCKET = 'avatars'
const PUBLIC_BUCKET_SEGMENT = `/storage/v1/object/public/${AVATAR_BUCKET}/`

type TxClient = {
  select: typeof import('@cairn/db').db.select
  update: typeof import('@cairn/db').db.update
  delete: typeof import('@cairn/db').db.delete
  execute: typeof import('@cairn/db').db.execute
}

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

async function lockMembershipAndActiveOwners(
  tx: TxClient,
  workspaceId: string,
  targetUserId: string,
  sql: typeof import('drizzle-orm').sql,
) {
  await tx.execute(sql`
    select 1
    from workspace_members
    where workspace_id = ${workspaceId}
      and (
        user_id = ${targetUserId}
        or (role = 'owner' and membership_status = 'active')
      )
    order by user_id
    for update
  `)
}

async function prepareAnonymization(
  tx: TxClient,
  workspaceId: string,
  targetUserId: string,
  callerRole: string | null,
  workspaceMembers: typeof import('@cairn/db').workspaceMembers,
  sql: typeof import('drizzle-orm').sql,
  and: typeof import('drizzle-orm').and,
  eq: typeof import('drizzle-orm').eq,
  count: typeof import('drizzle-orm').count,
) {
  await lockMembershipAndActiveOwners(tx, workspaceId, targetUserId, sql)

  const [memberInWorkspace] = await tx
    .select({
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      membershipStatus: workspaceMembers.membershipStatus,
    })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetUserId)))
    .limit(1)

  if (!memberInWorkspace) {
    return { ok: false as const, status: 404, error: 'Member not found' }
  }

  if (memberInWorkspace.role === 'owner') {
    if (callerRole !== 'owner') {
      return { ok: false as const, status: 403, error: 'owner の匿名化は owner のみ実行できます' }
    }

    if (memberInWorkspace.membershipStatus === 'active') {
      const ownerCountRows = await tx
        .select({ ownerCount: count() })
        .from(workspaceMembers)
        .where(and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.role, 'owner'),
          eq(workspaceMembers.membershipStatus, 'active'),
        ))
      const ownerCount = Number(ownerCountRows[0]?.ownerCount ?? 0)
      if (ownerCount <= 1) {
        return {
          ok: false as const,
          status: 422,
          error: 'ワークスペースには最低1人の owner が必要です',
        }
      }
    }
  }

  const avatarRows = await tx
    .select({ avatarUrl: workspaceMembers.avatarUrl })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetUserId)))

  const avatarPaths = [...new Set(
    avatarRows
      .map(row => extractAvatarPath(row.avatarUrl ?? null))
      .filter((path): path is string => Boolean(path)),
  )]

  return { ok: true as const, avatarPaths }
}

async function removeAvatarPaths(paths: string[]) {
  if (paths.length === 0) return

  const { createServiceRoleClient } = await import('@/lib/supabase/service')
  const supabase = createServiceRoleClient()
  const { error: storageError } = await supabase.storage.from(AVATAR_BUCKET).remove(paths)
  if (storageError) {
    console.error('[POST /api/workspaces/members/[userId]/anonymize] Storage remove failed:', storageError)
    throw { status: 500, error: 'Avatar cleanup failed' }
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId: targetUserId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, documentChunks, profiles, workspaceMembers } = await import('@cairn/db')
    const { and, count, eq, sql } = await import('drizzle-orm')

    const callerRole = await getWorkspaceMemberRole(ctx.workspaceId, ctx.userId)
    if (!isWorkspaceAdmin(callerRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const prepared = await db.transaction(async (tx) => prepareAnonymization(
      tx,
      ctx.workspaceId,
      targetUserId,
      callerRole,
      workspaceMembers,
      sql,
      and,
      eq,
      count,
    ))
    if (!prepared.ok) {
      return NextResponse.json({ error: prepared.error }, { status: prepared.status })
    }

    await removeAvatarPaths(prepared.avatarPaths)

    const now = new Date()
    await db.transaction(async (tx) => {
      const confirmed = await prepareAnonymization(
        tx,
        ctx.workspaceId,
        targetUserId,
        callerRole,
        workspaceMembers,
        sql,
        and,
        eq,
        count,
      )
      if (!confirmed.ok) {
        throw confirmed
      }
      const residualAvatarPaths = confirmed.avatarPaths.filter(path => !prepared.avatarPaths.includes(path))
      await removeAvatarPaths(residualAvatarPaths)
      await tx
        .update(workspaceMembers)
        .set({
          displayName: ANONYMIZED_DISPLAY_NAME,
          avatarUrl: null,
          membershipStatus: 'inactive',
          deactivatedAt: now,
          deactivatedBy: ctx.userId,
          status: 'offline',
          statusMessage: null,
        })
        .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, targetUserId)))
      await tx
        .delete(documentChunks)
        .where(and(
          eq(documentChunks.workspaceId, ctx.workspaceId),
          eq(documentChunks.sourceType, 'member'),
          eq(documentChunks.sourceId, targetUserId),
        ))

      const activeMembershipRows = await tx
        .select({ membershipCount: count() })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.userId, targetUserId), eq(workspaceMembers.membershipStatus, 'active')))
      const activeMembershipCount = Number(activeMembershipRows[0]?.membershipCount ?? 0)

      if (activeMembershipCount === 0) {
        await tx
          .update(profiles)
          .set({
            displayName: ANONYMIZED_DISPLAY_NAME,
            bio: null,
            icalToken: null,
            updatedAt: now,
          })
          .where(eq(profiles.id, targetUserId))
      }
    })

    clearWorkspaceCacheForUser(targetUserId)

    return NextResponse.json({ userId: targetUserId, anonymized: true })
  } catch (err) {
    if (typeof err === 'object' && err && 'status' in err && 'error' in err) {
      const knownError = err as { status: number; error: string }
      return NextResponse.json({ error: knownError.error }, { status: knownError.status })
    }
    console.error('[POST /api/workspaces/members/[userId]/anonymize]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
