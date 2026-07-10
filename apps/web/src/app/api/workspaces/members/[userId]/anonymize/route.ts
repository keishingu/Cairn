// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { ANONYMIZED_MEMBER_DISPLAY_NAME } from '@/lib/anonymized-member'
import { clearWorkspaceCacheForUser, getAuthContext } from '@/lib/get-auth-context'
import { getWorkspaceMemberRole, isWorkspaceAdmin } from '@/lib/permissions'

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

async function lockRelevantMemberships(
  tx: TxClient,
  workspaceId: string,
  targetUserId: string,
  sql: typeof import('drizzle-orm').sql,
) {
  await tx.execute(sql`
    select 1
    from workspace_members
    where user_id = ${targetUserId}
       or (
         workspace_id = ${workspaceId}
         and role = 'owner'
         and membership_status = 'active'
       )
    order by workspace_id, user_id
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
  await lockRelevantMemberships(tx, workspaceId, targetUserId, sql)

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

async function scrubStoredNotifications(
  tx: TxClient,
  workspaceId: string,
  targetUserId: string,
  sql: typeof import('drizzle-orm').sql,
) {
  await tx.execute(sql`
    delete from notifications
    where workspace_id = ${workspaceId}
      and (
        (
          type in ('dm', 'mention', 'file')
          and exists (
            select 1
            from messages
            where messages.id::text = notifications.data->>'messageId'
              and (
                messages.sender_id = ${targetUserId}
                or messages.content like ${`%<@${targetUserId}>%`}
                or messages.content like ${`%<@${targetUserId}|%`}
              )
          )
        )
        or (
          type = 'task'
          and exists (
            select 1
            from tasks
            where tasks.id::text = notifications.data->>'taskId'
              and tasks.created_by = ${targetUserId}
          )
        )
      )
  `)
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
    const { db, documentChunks, profiles, projectMembers, projects, tasks, workspaceMembers } = await import('@cairn/db')
    const { and, count, eq, inArray, sql } = await import('drizzle-orm')

    const callerRole = await getWorkspaceMemberRole(ctx.workspaceId, ctx.userId)
    if (!isWorkspaceAdmin(callerRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const now = new Date()
    const avatarPaths = await db.transaction(async (tx) => {
      const prepared = await prepareAnonymization(
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
      if (!prepared.ok) {
        throw prepared
      }

      await tx
        .update(workspaceMembers)
        .set({
          displayName: ANONYMIZED_MEMBER_DISPLAY_NAME,
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
      await scrubStoredNotifications(tx, ctx.workspaceId, targetUserId, sql)

      const affectedProjectRows = await tx
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .innerJoin(projects, eq(projectMembers.projectId, projects.id))
        .where(and(eq(projectMembers.userId, targetUserId), eq(projects.workspaceId, ctx.workspaceId)))
      const affectedProjectIds = affectedProjectRows.map(row => row.projectId)

      if (affectedProjectIds.length > 0) {
        await tx
          .delete(documentChunks)
          .where(and(
            eq(documentChunks.workspaceId, ctx.workspaceId),
            eq(documentChunks.sourceType, 'project'),
            inArray(documentChunks.sourceId, affectedProjectIds),
          ))
      }

      const activeMembershipRows = await tx
        .select({ membershipCount: count() })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.userId, targetUserId), eq(workspaceMembers.membershipStatus, 'active')))
      const activeMembershipCount = Number(activeMembershipRows[0]?.membershipCount ?? 0)

      if (activeMembershipCount === 0) {
        await tx
          .update(profiles)
          .set({
            displayName: ANONYMIZED_MEMBER_DISPLAY_NAME,
            bio: null,
            icalToken: null,
            updatedAt: now,
          })
          .where(eq(profiles.id, targetUserId))
      }

      return prepared.avatarPaths
    })

    await removeAvatarPaths(avatarPaths)

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
