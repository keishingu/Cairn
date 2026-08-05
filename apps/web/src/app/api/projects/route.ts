// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { createProjectSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'

export interface ProjectDto {
  id: string
  title: string
  description: string | null
  statusName: string | null
  statusColor: string | null
  startDate: string | null
  endDate: string | null
  memberCount: number
  memberNames: string[]
  memberAvatarUrls: (string | null)[]
  taskCount: number
  completedTaskCount: number
  isOwner: boolean
  isMember: boolean
  archived: boolean
  coverPhotoIdx: number
  coverPhotoUrl: string | null
  location: string | null
  placeId: string | null
}

function coverPhotoIdxFromId(id: string): number {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return h
}

export async function GET() {
  const { ctx, error: authError } = await getAuthContext({
    allowApiToken: true,
    requiredApiTokenScope: 'read',
  })
  if (authError) return authError

  try {
    const { db } = await import('@cairn/db')
    const { projects, projectStatuses, projectMembers, tasks, profiles, workspaceMembers, activeWorkspaceMembers } = await import('@cairn/db')
    const { eq, count, and, inArray } = await import('drizzle-orm')
    const { sql } = await import('drizzle-orm')

    // ゲストは参加中のプロジェクトのみ参照可能（getAuthContext が再照合した ctx.role で判定）
    const isGuest = ctx.role === 'guest'
    let visibleProjectIds: string[] | null = null
    if (isGuest) {
      const memberRows = await db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .innerJoin(projects, eq(projectMembers.projectId, projects.id))
        .where(and(eq(projectMembers.userId, ctx.userId), eq(projects.workspaceId, ctx.workspaceId)))
      visibleProjectIds = memberRows.map(r => r.projectId)
      if (visibleProjectIds.length === 0) return NextResponse.json([])
    }

    const rows = await db
      .select({
        id: projects.id,
        title: projects.title,
        description: projects.description,
        statusName: projectStatuses.name,
        statusColor: projectStatuses.color,
        startDate: projects.startDate,
        endDate: projects.endDate,
        archived: projects.archived,
        createdBy: projects.createdBy,
        coverPhotoUrl: projects.coverPhotoUrl,
        location: projects.location,
        placeId: projects.placeId,
      })
      .from(projects)
      .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
      .where(
        visibleProjectIds
          ? and(eq(projects.workspaceId, ctx.workspaceId), inArray(projects.id, visibleProjectIds))
          : eq(projects.workspaceId, ctx.workspaceId),
      )

    visibleProjectIds = rows.map(r => r.id)
    if (visibleProjectIds.length === 0) return NextResponse.json([])

    const [counts, memberRows, userMemberRows, taskRows] = await Promise.all([
      db
        .select({ projectId: projectMembers.projectId, n: count() })
        .from(projectMembers)
        .innerJoin(activeWorkspaceMembers, and(
          eq(activeWorkspaceMembers.workspaceId, ctx.workspaceId),
          eq(activeWorkspaceMembers.userId, projectMembers.userId),
        ))
        .where(inArray(projectMembers.projectId, visibleProjectIds))
        .groupBy(projectMembers.projectId),
      db
        .select({
          projectId: projectMembers.projectId,
          displayName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
          avatarUrl: workspaceMembers.avatarUrl,
        })
        .from(projectMembers)
        .innerJoin(activeWorkspaceMembers, and(
          eq(activeWorkspaceMembers.workspaceId, ctx.workspaceId),
          eq(activeWorkspaceMembers.userId, projectMembers.userId),
        ))
        .innerJoin(profiles, eq(projectMembers.userId, profiles.id))
        .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
        .where(inArray(projectMembers.projectId, visibleProjectIds))
        .orderBy(projectMembers.createdAt),
      db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(eq(projectMembers.userId, ctx.userId)),
      db
        .select({
          projectId: tasks.projectId,
          total: count(),
          completed: sql<number>`count(*) filter (where ${tasks.status} = 'done')`,
        })
        .from(tasks)
        .where(inArray(tasks.projectId, visibleProjectIds))
        .groupBy(tasks.projectId),
    ])

    const countMap = new Map(counts.map(r => [r.projectId, Number(r.n)]))

    const memberNamesMap = new Map<string, string[]>()
    const memberAvatarUrlsMap = new Map<string, (string | null)[]>()
    for (const row of memberRows) {
      const names = memberNamesMap.get(row.projectId) ?? []
      const avatarUrls = memberAvatarUrlsMap.get(row.projectId) ?? []
      if (names.length < 4) {
        names.push(row.displayName)
        avatarUrls.push(row.avatarUrl ?? null)
      }
      memberNamesMap.set(row.projectId, names)
      memberAvatarUrlsMap.set(row.projectId, avatarUrls)
    }

    const userProjectIds = new Set(userMemberRows.map(r => r.projectId))
    const taskMap = new Map(taskRows.map(r => [r.projectId, { total: Number(r.total), completed: Number(r.completed) }]))

    const result: ProjectDto[] = rows.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      statusName: r.statusName ?? null,
      statusColor: r.statusColor ?? null,
      startDate: r.startDate,
      endDate: r.endDate,
      archived: r.archived,
      memberCount: countMap.get(r.id) ?? 0,
      memberNames: memberNamesMap.get(r.id) ?? [],
      memberAvatarUrls: memberAvatarUrlsMap.get(r.id) ?? [],
      taskCount: taskMap.get(r.id)?.total ?? 0,
      completedTaskCount: taskMap.get(r.id)?.completed ?? 0,
      isOwner: r.createdBy === ctx.userId,
      isMember: userProjectIds.has(r.id),
      coverPhotoIdx: coverPhotoIdxFromId(r.id),
      coverPhotoUrl: r.coverPhotoUrl ?? null,
      location: r.location ?? null,
      placeId: r.placeId ?? null,
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/projects] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createProjectSchema.safeParse({ ...(body as object), workspaceId: ctx.workspaceId })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const forbidden = requireRole(ctx.role, 'admin')
  if (forbidden) return forbidden

  try {
    const { db } = await import('@cairn/db')
    const { projects, channels, projectStatuses, projectMembers, workspaceMembers, activeWorkspaceMembers, profiles } = await import('@cairn/db')
    const { eq, and, inArray } = await import('drizzle-orm')
    const selectedMemberIds = [...new Set(parsed.data.memberUserIds ?? [])]

    if (selectedMemberIds.length > 0) {
      // 新規プロジェクトに追加できるのは active メンバーのみ
      const wsRows = await db
        .select({ userId: activeWorkspaceMembers.userId })
        .from(activeWorkspaceMembers)
        .where(and(eq(activeWorkspaceMembers.workspaceId, ctx.workspaceId), inArray(activeWorkspaceMembers.userId, selectedMemberIds)))

      if (wsRows.length !== selectedMemberIds.length) {
        return NextResponse.json({ error: 'User is not a workspace member' }, { status: 422 })
      }
    }

    let coverPhotoUrl = parsed.data.coverPhotoUrl ?? null

    if (parsed.data.placePhotoName && !coverPhotoUrl) {
      const { fetchAndStoreCoverFromPlace } = await import('@/lib/cover-photo')
      coverPhotoUrl = await fetchAndStoreCoverFromPlace(parsed.data.placePhotoName)
    }

    const [inserted] = await db
      .insert(projects)
      .values({
        workspaceId: ctx.workspaceId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        statusId: parsed.data.statusId ?? null,
        startDate: parsed.data.startDate ?? null,
        endDate: parsed.data.endDate ?? null,
        coverPhotoUrl,
        location: parsed.data.location ?? null,
        placeId: parsed.data.placeId ?? null,
        createdBy: ctx.userId,
      })
      .returning({ id: projects.id, title: projects.title, description: projects.description, startDate: projects.startDate, endDate: projects.endDate, coverPhotoUrl: projects.coverPhotoUrl, location: projects.location })

    if (!inserted) throw new Error('Insert returned no rows')

    let statusName: string | null = null
    let statusColor: string | null = null
    if (parsed.data.statusId) {
      const [st] = await db
        .select({ name: projectStatuses.name, color: projectStatuses.color })
        .from(projectStatuses)
        .where(eq(projectStatuses.id, parsed.data.statusId))
        .limit(1)
      statusName = st?.name ?? null
      statusColor = st?.color ?? null
    }

    await db.insert(channels).values({
      workspaceId: ctx.workspaceId,
      projectId: inserted.id,
      type: 'project',
    })

    let memberNames: string[] = []
    let memberAvatarUrls: (string | null)[] = []
    if (selectedMemberIds.length > 0) {
      await db.insert(projectMembers).values(
        selectedMemberIds.map(userId => ({
          projectId: inserted.id,
          userId,
          role: 'member' as const,
          attendance: 'attending' as const,
        })),
      )

      const memberRows = await db
        .select({
          userId: profiles.id,
          displayName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
          avatarUrl: workspaceMembers.avatarUrl,
        })
        .from(profiles)
        .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
        .where(inArray(profiles.id, selectedMemberIds))

      const memberMap = new Map(memberRows.map(row => [row.userId, row]))
      const selectedMembers = selectedMemberIds
        .map(userId => memberMap.get(userId))
        .filter((row): row is NonNullable<typeof row> => row !== undefined)

      memberNames = selectedMembers.slice(0, 4).map(row => row.displayName)
      memberAvatarUrls = selectedMembers.slice(0, 4).map(row => row.avatarUrl ?? null)
    }

    try {
      const { inngest } = await import('@/lib/inngest/client')
      await inngest.send({
        name: 'project/upserted',
        data: { projectId: inserted.id, workspaceId: ctx.workspaceId },
      })
    } catch (e) {
      console.warn('[/api/projects] Inngest event send failed (indexing skipped):', e)
    }

    return NextResponse.json({
      id: inserted.id,
      title: inserted.title,
      description: inserted.description,
      statusName,
      statusColor,
      startDate: inserted.startDate,
      endDate: inserted.endDate,
      memberCount: selectedMemberIds.length,
      memberNames,
      memberAvatarUrls,
      taskCount: 0,
      completedTaskCount: 0,
      isOwner: true,
      isMember: selectedMemberIds.includes(ctx.userId),
      archived: false,
      coverPhotoIdx: coverPhotoIdxFromId(inserted.id),
      coverPhotoUrl: inserted.coverPhotoUrl ?? null,
      location: inserted.location ?? null,
      placeId: parsed.data.placeId ?? null,
    } satisfies ProjectDto, { status: 201 })
  } catch (err) {
    console.error('[/api/projects POST] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
