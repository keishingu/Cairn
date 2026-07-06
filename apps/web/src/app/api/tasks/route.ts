// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createTaskSchema } from '@cairn/shared'
import { getGuestVisibleProjectIds, getWorkspaceMemberRole, requireProjectAccess } from '@/lib/permissions'
import { inngest } from '@/lib/inngest/client'
import type { TaskAssignedEvent } from '@/lib/inngest/events'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'
import { sql } from 'drizzle-orm'

export interface TaskDto {
  id: string
  projectId: string
  projectTitle: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
  priority: 'high' | 'medium' | 'low'
  dueDate: string | null
  assigneeName: string | null
  assigneeAvatarUrl: string | null
  isLinkedToMessage: boolean
}

export interface TaskListPage {
  tasks: TaskDto[]
  nextCursor: string | null
}

const DEFAULT_TASK_PAGE_SIZE = 50
const MAX_TASK_PAGE_SIZE = 200

function parseLimit(rawLimit: string | null): number | null {
  if (rawLimit == null) return null
  const parsed = Number.parseInt(rawLimit, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TASK_PAGE_SIZE
  return Math.min(parsed, MAX_TASK_PAGE_SIZE)
}

function encodeTaskCursor(createdAtMicros: string, id: string): string {
  return `${createdAtMicros}__${id}`
}

function decodeTaskCursor(cursor: string): { createdAtMicros: string; id: string } | null {
  const separatorIndex = cursor.lastIndexOf('__')
  if (separatorIndex <= 0) return null

  const createdAtMicros = cursor.slice(0, separatorIndex)
  const id = cursor.slice(separatorIndex + 2)
  if (!/^\d+$/.test(createdAtMicros) || id.length === 0) return null
  return { createdAtMicros, id }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId') ?? undefined
  const pageSize = parseLimit(searchParams.get('limit'))
  const cursor = searchParams.get('cursor')
  const paginationEnabled = pageSize != null
  const decodedCursor = cursor ? decodeTaskCursor(cursor) : null

  if (cursor && (!paginationEnabled || decodedCursor == null)) {
    return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 })
  }

  try {
    const { ctx, error } = await getAuthContext()
    if (error) return error

    const { db } = await import('@cairn/db')
    const { tasks, projects, profiles, workspaceMembers } = await import('@cairn/db')
    const { eq, inArray, and, or, lt, desc } = await import('drizzle-orm')
    const taskCreatedAtMicros = sql<string>`((extract(epoch from ${tasks.createdAt}) * 1000000)::bigint)::text`

    const projectRows = await db
      .select({ id: projects.id, title: projects.title })
      .from(projects)
      .where(eq(projects.workspaceId, ctx.workspaceId))

    // ゲストは参加プロジェクトのタスクのみ閲覧可。projectId 指定があっても参加外なら除外する。
    const role = await getWorkspaceMemberRole(ctx.workspaceId, ctx.userId)
    let allowedProjectIds = projectRows.map(p => p.id)
    if (role === 'guest') {
      const guestProjectIds = new Set(await getGuestVisibleProjectIds(ctx.workspaceId, ctx.userId))
      allowedProjectIds = allowedProjectIds.filter(id => guestProjectIds.has(id))
    }

    const projectIds = projectId
      ? allowedProjectIds.filter(id => id === projectId)
      : allowedProjectIds

    if (projectIds.length === 0) {
      if (paginationEnabled) {
        return NextResponse.json({ tasks: [], nextCursor: null } satisfies TaskListPage)
      }
      return NextResponse.json([])
    }

    const taskWhere = decodedCursor
      ? and(
          inArray(tasks.projectId, projectIds),
          or(
            sql`${taskCreatedAtMicros} < ${decodedCursor.createdAtMicros}`,
            and(sql`${taskCreatedAtMicros} = ${decodedCursor.createdAtMicros}`, lt(tasks.id, decodedCursor.id)),
          ),
        )
      : inArray(tasks.projectId, projectIds)

    const taskQuery = db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        createdAt: tasks.createdAt,
        createdAtMicros: taskCreatedAtMicros,
        sourceMessageId: tasks.sourceMessageId,
        assigneeName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
        assigneeAvatarUrl: workspaceMembers.avatarUrl,
      })
      .from(tasks)
      .leftJoin(profiles, eq(tasks.assigneeId, profiles.id))
      .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, tasks.assigneeId), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
      .where(taskWhere)
      .orderBy(desc(tasks.createdAt), desc(tasks.id))

    const taskRows = paginationEnabled
      ? await taskQuery.limit(pageSize + 1)
      : await taskQuery

    const projectMap = new Map(projectRows.map(p => [p.id, p.title]))
    const pageRows = paginationEnabled ? taskRows.slice(0, pageSize) : taskRows

    const result: TaskDto[] = pageRows.map(r => ({
      id: r.id,
      projectId: r.projectId,
      projectTitle: projectMap.get(r.projectId) ?? '',
      title: r.title,
      status: r.status,
      priority: r.priority,
      dueDate: r.dueDate,
      assigneeName: r.assigneeName ?? null,
      assigneeAvatarUrl: r.assigneeAvatarUrl ?? null,
      isLinkedToMessage: r.sourceMessageId != null,
    }))

    if (paginationEnabled) {
      const lastRow = pageRows.at(-1)
      const nextCursor = taskRows.length > pageSize && lastRow
        ? encodeTaskCursor(lastRow.createdAtMicros, lastRow.id)
        : null
      return NextResponse.json({ tasks: result, nextCursor } satisfies TaskListPage)
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/tasks] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createTaskSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const { ctx, error } = await getAuthContext()
    if (error) return error

    // ゲストは参加プロジェクトにのみタスクを作成できる
    const forbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, parsed.data.projectId)
    if (forbidden) return forbidden

    const { db } = await import('@cairn/db')
    const { tasks, projects, profiles, workspaceMembers } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    const [inserted] = await db
      .insert(tasks)
      .values({
        projectId: parsed.data.projectId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        priority: parsed.data.priority,
        assigneeId: parsed.data.assigneeId ?? null,
        dueDate: parsed.data.dueDate ?? null,
        createdBy: ctx.userId,
      })
      .returning()

    if (!inserted) throw new Error('Insert returned no rows')

    const [projectRow] = await db
      .select({ title: projects.title })
      .from(projects)
      .where(eq(projects.id, inserted.projectId))

    const assigneeRow = inserted.assigneeId
      ? (await db
          .select({
            displayName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
            avatarUrl: workspaceMembers.avatarUrl,
          })
          .from(profiles)
          .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
          .where(eq(profiles.id, inserted.assigneeId)))[0]
      : null

    const result: TaskDto = {
      id: inserted.id,
      projectId: inserted.projectId,
      projectTitle: projectRow?.title ?? '',
      title: inserted.title,
      status: inserted.status,
      priority: inserted.priority,
      dueDate: inserted.dueDate,
      assigneeName: assigneeRow?.displayName ?? null,
      assigneeAvatarUrl: assigneeRow?.avatarUrl ?? null,
      isLinkedToMessage: false,
    }

    if (inserted.assigneeId && inserted.assigneeId !== ctx.userId) {
      const [assigner] = await db
        .select({ displayName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName) })
        .from(profiles)
        .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
        .where(eq(profiles.id, ctx.userId))

      try {
        await inngest.send({
          name: 'task/assigned',
          data: {
            taskId: inserted.id,
            taskTitle: inserted.title,
            assigneeId: inserted.assigneeId,
            projectId: inserted.projectId,
            projectTitle: projectRow?.title ?? '',
            workspaceId: ctx.workspaceId,
            assignerName: assigner?.displayName ?? '不明',
          },
        } satisfies TaskAssignedEvent)
      } catch (e) {
        console.warn('[POST /api/tasks] Inngest event send failed (notification skipped):', e)
      }
    }

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('[POST /api/tasks] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
