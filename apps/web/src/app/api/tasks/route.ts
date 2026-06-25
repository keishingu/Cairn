// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createTaskSchema } from '@cairn/shared'
import { getGuestVisibleProjectIds, getWorkspaceMemberRole, requireProjectAccess } from '@/lib/permissions'
import { inngest } from '@/lib/inngest/client'
import type { TaskAssignedEvent } from '@/lib/inngest/events'

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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId') ?? undefined

  try {
    const { ctx, error } = await getAuthContext()
    if (error) return error

    const { db } = await import('@cairn/db')
    const { tasks, projects, profiles, workspaceMembers } = await import('@cairn/db')
    const { eq, inArray } = await import('drizzle-orm')

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

    if (projectIds.length === 0) return NextResponse.json([])

    const taskRows = await db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        sourceMessageId: tasks.sourceMessageId,
        assigneeName: profiles.displayName,
        assigneeAvatarUrl: workspaceMembers.avatarUrl,
      })
      .from(tasks)
      .leftJoin(profiles, eq(tasks.assigneeId, profiles.id))
      .leftJoin(workspaceMembers, eq(workspaceMembers.userId, tasks.assigneeId))
      .where(inArray(tasks.projectId, projectIds))

    const projectMap = new Map(projectRows.map(p => [p.id, p.title]))

    const result: TaskDto[] = taskRows.map(r => ({
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
    const { eq } = await import('drizzle-orm')

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
          .select({ displayName: profiles.displayName, avatarUrl: workspaceMembers.avatarUrl })
          .from(profiles)
          .leftJoin(workspaceMembers, eq(workspaceMembers.userId, profiles.id))
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
        .select({ displayName: profiles.displayName })
        .from(profiles)
        .where(eq(profiles.id, ctx.userId))

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
    }

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('[POST /api/tasks] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
