// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createTaskSchema } from '@cairn/shared'
import { getGuestVisibleProjectIds, requireProjectAccess, requireRole } from '@/lib/permissions'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'
import { isAssignableTaskMember, notifyTaskAssigned } from '@/lib/tasks/assignment-notification'

export interface TaskDto {
  id: string
  projectId: string | null
  projectTitle: string | null
  title: string
  status: 'todo' | 'in_progress' | 'done'
  priority: 'high' | 'medium' | 'low'
  dueDate: string | null
  assigneeId: string | null
  assigneeName: string | null
  assigneeAvatarUrl: string | null
  /** チャット由来タスクの共有元メッセージ。未紐付けなら null。 */
  sourceMessageId?: string | null
  isLinkedToMessage: boolean
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId') ?? undefined
  const assignee = searchParams.get('assignee') ?? undefined

  if (assignee && assignee !== 'me') {
    return NextResponse.json({ error: 'assignee must be "me"' }, { status: 422 })
  }

  const { ctx, error } = await getAuthContext({
    allowApiToken: true,
    requiredApiTokenScope: 'read',
  })
  if (error) return error

  try {
    const { db } = await import('@cairn/db')
    const { tasks, projects, profiles, workspaceMembers } = await import('@cairn/db')
    const { eq, and, inArray } = await import('drizzle-orm')

    // ゲストは参加プロジェクトのタスクのみ閲覧可。プロジェクト未所属タスクは見せない。
    const guestProjectIds = ctx.role === 'guest'
      ? await getGuestVisibleProjectIds(ctx.workspaceId, ctx.userId)
      : null
    // ゲストで可視プロジェクトが無ければ SQL を実行せず空を返す（inArray の空配列を避ける）
    if (guestProjectIds && guestProjectIds.length === 0) {
      return NextResponse.json([])
    }

    // 絞り込みは SQL 側で行う（タスク数の多いワークスペースで単一プロジェクト表示が
    // 全件スキャンにならないように、また guest が見えないタスクを読まないようにする）
    const conditions = [eq(tasks.workspaceId, ctx.workspaceId)]
    if (projectId) conditions.push(eq(tasks.projectId, projectId))
    if (assignee === 'me') conditions.push(eq(tasks.assigneeId, ctx.userId))
    if (guestProjectIds) conditions.push(inArray(tasks.projectId, guestProjectIds))

    const taskRows = await db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        projectTitle: projects.title,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        assigneeId: tasks.assigneeId,
        sourceMessageId: tasks.sourceMessageId,
        assigneeName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
        assigneeAvatarUrl: workspaceMembers.avatarUrl,
      })
      .from(tasks)
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .leftJoin(profiles, eq(tasks.assigneeId, profiles.id))
      .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, tasks.assigneeId), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
      .where(and(...conditions))

    const result: TaskDto[] = taskRows.map(r => ({
      id: r.id,
      projectId: r.projectId,
      projectTitle: r.projectTitle ?? null,
      title: r.title,
      status: r.status,
      priority: r.priority,
      dueDate: r.dueDate,
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeName ?? null,
      assigneeAvatarUrl: r.assigneeAvatarUrl ?? null,
      sourceMessageId: r.sourceMessageId,
      isLinkedToMessage: r.sourceMessageId != null,
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/tasks] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { ctx, error: authError } = await getAuthContext({
    allowApiToken: true,
    requiredApiTokenScope: 'write',
  })
  if (authError) return authError

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
    const projectId = parsed.data.projectId ?? null
    if (projectId) {
      // ゲストは参加プロジェクトにのみタスクを作成できる
      const forbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, projectId, ctx.role)
      if (forbidden) return forbidden
    } else {
      // プロジェクト未所属タスクは member 以上のみ作成可（ゲストはプロジェクト必須）
      const forbidden = requireRole(ctx.role, 'member')
      if (forbidden) return forbidden
    }

    const { db } = await import('@cairn/db')
    const { tasks, projects, profiles, workspaceMembers } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    // projectId を受け付ける前に、そのプロジェクトが ctx.workspaceId に属することを明示的に確認する。
    // requireProjectAccess は member 以上を素通しするため、別ワークスペースの projectId を
    // tasks.workspace_id=自WS と組み合わせて保存できてしまい（別WSのタイトル・件数の漏洩や
    // 越境データ汚染につながる）。FK はプロジェクトの存在しか保証しないためここで所属を検証する。
    let projectTitle: string | null = null
    if (projectId) {
      const [projectRow] = await db
        .select({ title: projects.title })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
        .limit(1)
      if (!projectRow) {
        return NextResponse.json({ error: 'プロジェクトが見つかりません' }, { status: 404 })
      }
      projectTitle = projectRow.title
    }

    const assigneeId = parsed.data.assigneeId ?? null
    if (assigneeId && !(await isAssignableTaskMember(ctx.workspaceId, assigneeId, projectId))) {
      return NextResponse.json(
        { error: '指定された担当者はこのタスクに割り当てできません' },
        { status: 422 },
      )
    }

    const [inserted] = await db
      .insert(tasks)
      .values({
        workspaceId: ctx.workspaceId,
        projectId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        priority: parsed.data.priority,
        assigneeId,
        dueDate: parsed.data.dueDate ?? null,
        createdBy: ctx.userId,
      })
      .returning()

    if (!inserted) throw new Error('Insert returned no rows')

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
      projectTitle,
      title: inserted.title,
      status: inserted.status,
      priority: inserted.priority,
      dueDate: inserted.dueDate,
      assigneeId: inserted.assigneeId,
      assigneeName: assigneeRow?.displayName ?? null,
      assigneeAvatarUrl: assigneeRow?.avatarUrl ?? null,
      sourceMessageId: null,
      isLinkedToMessage: false,
    }

    if (inserted.assigneeId) {
      await notifyTaskAssigned({
        workspaceId: ctx.workspaceId,
        assignerId: ctx.userId,
        assigneeId: inserted.assigneeId,
        taskId: inserted.id,
        taskTitle: inserted.title,
        projectId: inserted.projectId,
        projectTitle: projectTitle ?? '',
      })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('[POST /api/tasks] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
