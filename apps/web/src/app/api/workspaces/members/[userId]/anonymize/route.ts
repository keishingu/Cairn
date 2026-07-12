// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { ANONYMIZED_MEMBER_DISPLAY_NAME } from '@/lib/anonymized-member'
import { clearWorkspaceCacheForUser, getAuthContext } from '@/lib/get-auth-context'
import { getWorkspaceMemberRole, isWorkspaceAdmin } from '@/lib/permissions'

const AVATAR_BUCKET = 'avatars'
const PUBLIC_BUCKET_SEGMENT = `/storage/v1/object/public/${AVATAR_BUCKET}/`
const AVATAR_VARIANT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'] as const

type TxClient = {
  select: typeof import('@cairn/db').db.select
  update: typeof import('@cairn/db').db.update
  delete: typeof import('@cairn/db').db.delete
  execute: typeof import('@cairn/db').db.execute
}

type MembershipSnapshot = {
  workspaceId: string
  avatarUrl: string | null
  displayName: string | null
}

type ProjectReindexTarget = {
  workspaceId: string
  projectId: string
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, '\\$&')
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

function expandAvatarVariantPaths(paths: string[]) {
  const expanded = new Set<string>()

  for (const path of paths) {
    expanded.add(path)
    const lastDotIndex = path.lastIndexOf('.')
    if (lastDotIndex <= 0) continue
    const base = path.slice(0, lastDotIndex)
    for (const ext of AVATAR_VARIANT_EXTENSIONS) {
      expanded.add(`${base}.${ext}`)
    }
  }

  return [...expanded]
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

  const membershipRows = await tx
    .select({
      workspaceId: workspaceMembers.workspaceId,
      avatarUrl: workspaceMembers.avatarUrl,
      displayName: workspaceMembers.displayName,
    })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetUserId)))

  const avatarPaths = expandAvatarVariantPaths(
    [...new Set(
      membershipRows
        .map(row => extractAvatarPath(row.avatarUrl ?? null))
        .filter((path): path is string => Boolean(path)),
    )],
  )

  return {
    ok: true as const,
    avatarPaths,
    membershipRows: membershipRows as MembershipSnapshot[],
    legacyDisplayNames: uniqueNonEmpty(membershipRows.map(row => row.displayName)),
  }
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return [...new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))]
}

function mergeMembershipSnapshots(...groups: MembershipSnapshot[][]): MembershipSnapshot[] {
  const merged = new Map<string, MembershipSnapshot>()
  for (const group of groups) {
    for (const membership of group) {
      const current = merged.get(membership.workspaceId)
      if (!current || (!current.avatarUrl && membership.avatarUrl)) {
        merged.set(membership.workspaceId, membership)
      }
    }
  }
  return [...merged.values()]
}

function buildAiScrubPatterns(values: Array<string | null | undefined>) {
  return uniqueNonEmpty(values)
    .filter(value => value !== ANONYMIZED_MEMBER_DISPLAY_NAME)
    .map(value => `%${escapeLikePattern(value)}%`)
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
          and (
            exists (
              select 1
              from tasks
              where tasks.id::text = notifications.data->>'taskId'
                and tasks.created_by = ${targetUserId}
            )
            or notifications.data->>'assignerId' = ${targetUserId}
            or (
              coalesce(notifications.data->>'assignerId', '') = ''
              and notifications.data->>'assignerName' in (
                select legacy_names.display_name
                from (
                  select workspace_members.display_name
                  from workspace_members
                  where workspace_members.workspace_id = ${workspaceId}
                    and workspace_members.user_id = ${targetUserId}
                    and workspace_members.display_name is not null
                  union
                  select profiles.display_name
                  from profiles
                  where profiles.id = ${targetUserId}
                    and profiles.display_name is not null
                ) as legacy_names
              )
            )
          )
        )
      )
  `)
}

async function scrubAiConversationArtifacts(
  tx: TxClient,
  workspaceIds: string[],
  targetUserId: string,
  patterns: string[],
  sql: typeof import('drizzle-orm').sql,
) {
  if (workspaceIds.length === 0) return
  const workspaceIdList = sql.join(workspaceIds.map(workspaceId => sql`${workspaceId}`), sql`, `)

  await tx.execute(sql`
    delete from ai_conversations
    where workspace_id in (${workspaceIdList})
      and created_by = ${targetUserId}
  `)

  if (patterns.length === 0) return

  const patternClauses = patterns.map(pattern => sql`
    ai_messages.content like ${pattern} escape '\'
    or coalesce(ai_messages.annotations::text, '') like ${pattern} escape '\'
    or coalesce(ai_messages.tool_invocations::text, '') like ${pattern} escape '\'
  `)
  const titlePatternClauses = patterns.map(pattern => sql`
    coalesce(ai_conversations.title, '') like ${pattern} escape '\'
  `)

  await tx.execute(sql`
    delete from ai_messages
    using ai_conversations
    where ai_messages.conversation_id = ai_conversations.id
      and ai_conversations.workspace_id in (${workspaceIdList})
      and (${sql.join(patternClauses, sql` or `)})
  `)

  await tx.execute(sql`
    update ai_conversations
    set title = null
    where workspace_id in (${workspaceIdList})
      and (${sql.join(titlePatternClauses, sql` or `)})
  `)
}

async function scrubAllWorkspaceArtifactsForFinalErasure(
  tx: TxClient,
  targetUserId: string,
  workspaceIds: string[],
  legacyDisplayNames: string[],
  profileBio: string | null,
  now: Date,
  actorUserId: string,
  tables: {
    connectedAccounts: typeof import('@cairn/db').connectedAccounts
    documentChunks: typeof import('@cairn/db').documentChunks
    googleCalendarEvents: typeof import('@cairn/db').googleCalendarEvents
    memberExperiences: typeof import('@cairn/db').memberExperiences
    projectMembers: typeof import('@cairn/db').projectMembers
    projects: typeof import('@cairn/db').projects
    profiles: typeof import('@cairn/db').profiles
    pushSubscriptions: typeof import('@cairn/db').pushSubscriptions
    workspaceMembers: typeof import('@cairn/db').workspaceMembers
  },
  helpers: {
    and: typeof import('drizzle-orm').and
    eq: typeof import('drizzle-orm').eq
    inArray: typeof import('drizzle-orm').inArray
    sql: typeof import('drizzle-orm').sql
  },
) {
  const { connectedAccounts, documentChunks, googleCalendarEvents, memberExperiences, projectMembers, projects, profiles, pushSubscriptions, workspaceMembers } = tables
  const { and, eq, inArray, sql } = helpers

  for (const workspaceId of workspaceIds) {
    await scrubStoredNotifications(tx, workspaceId, targetUserId, sql)
  }

  await tx
    .update(workspaceMembers)
    .set({
      displayName: ANONYMIZED_MEMBER_DISPLAY_NAME,
      avatarUrl: null,
      membershipStatus: 'inactive',
      deactivatedAt: now,
      deactivatedBy: actorUserId,
      status: 'offline',
      statusMessage: null,
    })
    .where(eq(workspaceMembers.userId, targetUserId))

  await tx
    .delete(documentChunks)
    .where(and(
      inArray(documentChunks.workspaceId, workspaceIds),
      eq(documentChunks.sourceType, 'member'),
      eq(documentChunks.sourceId, targetUserId),
    ))

  const affectedProjectRows = await tx
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(and(eq(projectMembers.userId, targetUserId), inArray(projects.workspaceId, workspaceIds)))
  const affectedProjectIds = [...new Set(affectedProjectRows.map(row => row.projectId))]

  if (affectedProjectIds.length > 0) {
    await tx
      .delete(documentChunks)
      .where(and(
        inArray(documentChunks.workspaceId, workspaceIds),
        eq(documentChunks.sourceType, 'project'),
        inArray(documentChunks.sourceId, affectedProjectIds),
      ))
  }

  const aiPatterns = buildAiScrubPatterns([
    targetUserId,
    profileBio,
    ...legacyDisplayNames,
  ])

  await scrubAiConversationArtifacts(tx, workspaceIds, targetUserId, aiPatterns, sql)

  await tx
    .delete(googleCalendarEvents)
    .where(eq(googleCalendarEvents.userId, targetUserId))

  await tx
    .delete(connectedAccounts)
    .where(and(
      eq(connectedAccounts.userId, targetUserId),
      eq(connectedAccounts.provider, 'google_calendar'),
    ))

  await tx
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, targetUserId))

  await tx
    .delete(memberExperiences)
    .where(eq(memberExperiences.userId, targetUserId))

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

async function restoreAvatarUrls(
  targetUserId: string,
  memberships: MembershipSnapshot[],
  workspaceMembers: typeof import('@cairn/db').workspaceMembers,
  and: typeof import('drizzle-orm').and,
  eq: typeof import('drizzle-orm').eq,
) {
  const rowsToRestore = memberships.filter((membership): membership is MembershipSnapshot & { avatarUrl: string } => Boolean(membership.avatarUrl))
  if (rowsToRestore.length === 0) return

  const { db } = await import('@cairn/db')
  await db.transaction(async (tx) => {
    for (const membership of rowsToRestore) {
      await tx
        .update(workspaceMembers)
        .set({ avatarUrl: membership.avatarUrl })
        .where(and(
          eq(workspaceMembers.workspaceId, membership.workspaceId),
          eq(workspaceMembers.userId, targetUserId),
        ))
    }
  })
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId: targetUserId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { connectedAccounts, db, documentChunks, googleCalendarEvents, memberExperiences, profiles, projectMembers, projects, pushSubscriptions, tasks, workspaceMembers } = await import('@cairn/db')
    const { and, count, eq, inArray, sql } = await import('drizzle-orm')

    const callerRole = await getWorkspaceMemberRole(ctx.workspaceId, ctx.userId)
    if (!isWorkspaceAdmin(callerRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const now = new Date()
    const { avatarPaths, avatarRestoreRows, projectReindexTargets } = await db.transaction(async (tx) => {
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

      await scrubStoredNotifications(tx, ctx.workspaceId, targetUserId, sql)

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

      const affectedProjectRows = await tx
        .select({ projectId: projectMembers.projectId, workspaceId: projects.workspaceId })
        .from(projectMembers)
        .innerJoin(projects, eq(projectMembers.projectId, projects.id))
        .where(and(eq(projectMembers.userId, targetUserId), eq(projects.workspaceId, ctx.workspaceId)))
      const affectedProjectIds = [...new Set(affectedProjectRows.map(row => row.projectId))]
      const projectReindexTargets = affectedProjectRows.map(row => ({
        workspaceId: row.workspaceId,
        projectId: row.projectId,
      }))

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
        const membershipRows = await tx
          .select({
            workspaceId: workspaceMembers.workspaceId,
            avatarUrl: workspaceMembers.avatarUrl,
            displayName: workspaceMembers.displayName,
          })
          .from(workspaceMembers)
          .where(eq(workspaceMembers.userId, targetUserId)) as MembershipSnapshot[]
        const allWorkspaceIds = membershipRows.length > 0
          ? [...new Set(membershipRows.map(row => row.workspaceId))]
          : [ctx.workspaceId]
        const allAvatarPaths = [...new Set([
          ...prepared.avatarPaths,
          ...membershipRows
            .map(row => extractAvatarPath(row.avatarUrl ?? null))
            .filter((path): path is string => Boolean(path)),
        ])]
        const allAffectedProjectRows = await tx
          .select({ projectId: projectMembers.projectId, workspaceId: projects.workspaceId })
          .from(projectMembers)
          .innerJoin(projects, eq(projectMembers.projectId, projects.id))
          .where(and(eq(projectMembers.userId, targetUserId), inArray(projects.workspaceId, allWorkspaceIds)))
        const [profileRow] = await tx
          .select({ displayName: profiles.displayName, bio: profiles.bio })
          .from(profiles)
          .where(eq(profiles.id, targetUserId))
          .limit(1)
        const legacyDisplayNames = uniqueNonEmpty([
          profileRow?.displayName ?? null,
          ...prepared.legacyDisplayNames,
          ...membershipRows.map(row => row.displayName),
        ])

        await scrubAllWorkspaceArtifactsForFinalErasure(
          tx,
          targetUserId,
          allWorkspaceIds,
          legacyDisplayNames,
          profileRow?.bio ?? null,
          now,
          ctx.userId,
          { connectedAccounts, documentChunks, googleCalendarEvents, memberExperiences, projectMembers, projects, profiles, pushSubscriptions, workspaceMembers },
          { and, eq, inArray, sql },
        )
        return {
          avatarPaths: allAvatarPaths,
          avatarRestoreRows: mergeMembershipSnapshots(prepared.membershipRows, membershipRows),
          projectReindexTargets: allAffectedProjectRows.map(row => ({
            workspaceId: row.workspaceId,
            projectId: row.projectId,
          })),
        }
      }

      return {
        avatarPaths: prepared.avatarPaths,
        avatarRestoreRows: prepared.membershipRows,
        projectReindexTargets,
      }
    })

    await db.transaction(async (tx) => {
      await lockRelevantMemberships(tx, ctx.workspaceId, targetUserId, sql)
      await scrubStoredNotifications(tx, ctx.workspaceId, targetUserId, sql)
    })

    try {
      await removeAvatarPaths(avatarPaths)
    } catch (removeError) {
      await restoreAvatarUrls(targetUserId, avatarRestoreRows, workspaceMembers, and, eq)
      throw removeError
    }

    clearWorkspaceCacheForUser(targetUserId)

    if (projectReindexTargets.length > 0) {
      try {
        const { inngest } = await import('@/lib/inngest/client')
        await inngest.send(projectReindexTargets.map(({ workspaceId, projectId }) => ({
          name: 'project/upserted' as const,
          data: { workspaceId, projectId },
        })))
      } catch (err) {
        console.warn('[/api/workspaces/members/[userId]/anonymize] project reindex send failed:', err)
      }
    }

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
