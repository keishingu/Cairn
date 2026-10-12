// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createTaskSchema } from '@cairn/shared'
import { getGuestVisibleProjectIds, requireChannelAccess, requireProjectAccess, requireRole } from '@/lib/permissions'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'
import { isAssignableTaskMember, notifyTaskAssigned } from '@/lib/tasks/assignment-notification'
import { hasTaskChannelSchema, insertLegacyTasks } from '@/lib/tasks/schema-readiness'
import { guestTaskScopeCondition, taskChannelVisibilityCondition } from '@/lib/tasks/visibility'

export interface TaskDto {
  id: string
  projectId: string | null
  projectTitle: string | null
  channelId: string | null
  channelName: string | null
  channelIsPrivate: boolean
  title: string
  description: string | null
  status: 'todo' | 'in_progress' | 'done'
  priority: 'high' | 'medium' | 'low'
  dueDate: string | null
  assigneeId: string | null
  assigneeName: string | null
  assigneeAvatarUrl: string | null
  /** チャット由来タスクの共有元メッセージ。未紐付けなら null。 */
  sourceMessageId?: string | null
  /** チェックボックスとの双方向同期を行うタスクか。 */
  isCheckboxTask: boolean
  isLinkedToMessage: boolean
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId') ?? undefined
  const channelId = searchParams.get('channelId') ?? undefined
  const assignee = searchParams.get('assignee') ?? undefined

  if (projectId && channelId) {
    return NextResponse.json({ error: 'projectId and channelId cannot both be specified' }, { status: 422 })
  }

  if (assignee && assignee !== 'me') {
    return NextResponse.json({ error: 'assignee must be "me"' }, { status: 422 })
  }

  const { ctx, error } = await getAuthContext({
    allowApiToken: true,
    requiredApiTokenScope: 'read',
  })
  if (error) return error

  if (projectId) {
    const forbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, projectId, ctx.role)
    if (forbidden) return forbidden
  }

  try {
    const { db } = await import('@cairn/db')
    const channelSchemaReady = await hasTaskChannelSchema(db)

    if (channelId) {
      if (!channelSchemaReady) {
        return NextResponse.json({ error: 'チャンネルタスクを準備中です' }, { status: 503 })
      }
      const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId, ctx.role)
      if (forbidden) return forbidden
    }

    const { tasks, projects, channels, profiles, workspaceMembers } = await import('@cairn/db')
    const { eq, and, or, inArray, isNull, isNotNull, sql } = await import('drizzle-orm')

    // ゲストは参加プロジェクトのタスクのみ閲覧可。プロジェクト未所属タスクは見せない。
    const guestProjectIds = ctx.role === 'guest'
      ? await getGuestVisibleProjectIds(ctx.workspaceId, ctx.userId)
      : null
    // 絞り込みは SQL 側で行う（タスク数の多いワークスペースで単一プロジェクト表示が
    // 全件スキャンにならないように、また guest が見えないタスクを読まないようにする）
    const conditions = [eq(tasks.workspaceId, ctx.workspaceId)]
    if (projectId) conditions.push(eq(tasks.projectId, projectId))
    if (channelId && channelSchemaReady) conditions.push(eq(tasks.channelId, channelId))
    if (assignee === 'me') conditions.push(eq(tasks.assigneeId, ctx.userId))
    // migration待機中に通常チャンネルから作られたタスクは source_message_id だけを保持する。
    // channel_id がbackfillされるまで未所属タスクとして露出させない。
    if (!channelSchemaReady) {
      conditions.push(or(isNull(tasks.sourceMessageId), isNotNull(tasks.projectId))!)
    }
    if (guestProjectIds && !projectId && !channelId) {
      if (channelSchemaReady) {
        conditions.push(guestTaskScopeCondition(ctx.userId, guestProjectIds))
      } else if (guestProjectIds.length === 0) {
        return NextResponse.json([])
      } else {
        conditions.push(inArray(tasks.projectId, guestProjectIds))
      }
    }
    if (channelSchemaReady) conditions.push(taskChannelVisibilityCondition(ctx.userId))

    const taskRows = await db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        projectTitle: projects.title,
        channelId: channelSchemaReady ? tasks.channelId : sql<string | null>`null`,
        channelName: channelSchemaReady ? channels.name : sql<string | null>`null`,
        channelIsPrivate: channelSchemaReady ? channels.isPrivate : sql<boolean>`false`,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        assigneeId: tasks.assigneeId,
        sourceMessageId: tasks.sourceMessageId,
        sourceCheckboxIndex: tasks.sourceCheckboxIndex,
        assigneeName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
        assigneeAvatarUrl: workspaceMembers.avatarUrl,
      })
      .from(tasks)
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .leftJoin(channels, channelSchemaReady ? eq(tasks.channelId, channels.id) : sql`false`)
      .leftJoin(profiles, eq(tasks.assigneeId, profiles.id))
      .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, tasks.assigneeId), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
      .where(and(...conditions))

    const result: TaskDto[] = taskRows.map(r => ({
      id: r.id,
      projectId: r.projectId,
      projectTitle: r.projectTitle ?? null,
      channelId: r.channelId,
      channelName: r.channelName ?? null,
      channelIsPrivate: r.channelIsPrivate ?? false,
      title: r.title,
      description: r.description,
      status: r.status,
      priority: r.priority,
      dueDate: r.dueDate,
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeName ?? null,
      assigneeAvatarUrl: r.assigneeAvatarUrl ?? null,
      sourceMessageId: r.sourceMessageId,
      isCheckboxTask: r.sourceCheckboxIndex != null,
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
    let projectId = parsed.data.projectId ?? null
    let channelId = parsed.data.channelId ?? null
    const { db } = await import('@cairn/db')
    const { tasks, projects, channels, messages, profiles, workspaceMembers } = await import('@cairn/db')
    const { eq, and, isNull, inArray } = await import('drizzle-orm')
    const channelSchemaReady = await hasTaskChannelSchema(db)
    let sourceMessageId: string | null = null

    if (parsed.data.sourceMessageId) {
      if (!channelSchemaReady) {
        return NextResponse.json({ error: 'チャット連携タスクを準備中です' }, { status: 503 })
      }
      const [source] = await db
        .select({
          id: messages.id,
          channelId: messages.channelId,
          projectId: channels.projectId,
          channelType: channels.type,
        })
        .from(messages)
        .innerJoin(channels, eq(messages.channelId, channels.id))
        .where(and(
          eq(messages.id, parsed.data.sourceMessageId),
          inArray(messages.messageType, ['text', 'html']),
          eq(channels.workspaceId, ctx.workspaceId),
          isNull(messages.deletedAt),
        ))
        .limit(1)

      if (!source) return NextResponse.json({ error: '共有元メッセージが見つかりません' }, { status: 404 })
      if (source.channelType === 'dm') {
        return NextResponse.json({ error: 'DMのメッセージからタスクは作成できません' }, { status: 422 })
      }
      if (source.channelType !== 'workspace' && source.channelType !== 'project') {
        return NextResponse.json({ error: '通常チャンネルのメッセージを指定してください' }, { status: 422 })
      }
      if (
        (parsed.data.channelId != null && parsed.data.channelId !== source.channelId)
        || (parsed.data.projectId != null && parsed.data.projectId !== source.projectId)
      ) {
        return NextResponse.json({ error: 'タスクの範囲は共有元メッセージと一致させてください' }, { status: 422 })
      }

      const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, source.channelId, ctx.role)
      if (forbidden) return forbidden

      // クライアント指定の範囲に依存せず、元メッセージのチャンネル範囲を保持する。
      projectId = source.projectId
      channelId = source.channelId
      sourceMessageId = source.id
    }

    if (!sourceMessageId && projectId) {
      // ゲストは参加プロジェクトにのみタスクを作成できる
      const forbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, projectId, ctx.role)
      if (forbidden) return forbidden
    } else if (!sourceMessageId && channelId) {
      const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId, ctx.role)
      if (forbidden) return forbidden
    } else if (!sourceMessageId) {
      // プロジェクト未所属タスクは member 以上のみ作成可（ゲストはプロジェクト必須）
      const forbidden = requireRole(ctx.role, 'member')
      if (forbidden) return forbidden
    }

    if (channelId && !channelSchemaReady) {
      return NextResponse.json({ error: 'チャンネルタスクを準備中です' }, { status: 503 })
    }

    // projectId を受け付ける前に、そのプロジェクトが ctx.workspaceId に属することを明示的に確認する。
    // requireProjectAccess は member 以上を素通しするため、別ワークスペースの projectId を
    // tasks.workspace_id=自WS と組み合わせて保存できてしまい（別WSのタイトル・件数の漏洩や
    // 越境データ汚染につながる）。FK はプロジェクトの存在しか保証しないためここで所属を検証する。
    let projectTitle: string | null = null
    let channelName: string | null = null
    let channelIsPrivate = false
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

    if (channelId) {
      const [channelRow] = await db
        .select({ name: channels.name, isPrivate: channels.isPrivate, type: channels.type })
        .from(channels)
        .where(and(eq(channels.id, channelId), eq(channels.workspaceId, ctx.workspaceId)))
        .limit(1)
      if (!channelRow || (!sourceMessageId && channelRow.type !== 'workspace')) {
        return NextResponse.json({ error: '通常チャンネルが見つかりません' }, { status: 404 })
      }
      channelName = channelRow.name
      channelIsPrivate = channelRow.isPrivate
    }

    const assigneeId = parsed.data.assigneeId ?? null
    if (assigneeId && !(await isAssignableTaskMember(ctx.workspaceId, assigneeId, projectId, channelId))) {
      return NextResponse.json(
        { error: '指定された担当者はこのタスクに割り当てできません' },
        { status: 422 },
      )
    }

    const taskValues = {
        workspaceId: ctx.workspaceId,
        projectId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        priority: parsed.data.priority,
        assigneeId,
        dueDate: parsed.data.dueDate ?? null,
        createdBy: ctx.userId,
        sourceMessageId,
        sourceCheckboxIndex: null,
      }
    const [inserted] = channelSchemaReady
      ? await db
          .insert(tasks)
          .values({ ...taskValues, channelId })
          .returning({
            id: tasks.id,
            projectId: tasks.projectId,
            title: tasks.title,
            status: tasks.status,
            priority: tasks.priority,
            dueDate: tasks.dueDate,
            assigneeId: tasks.assigneeId,
            sourceMessageId: tasks.sourceMessageId,
            sourceCheckboxIndex: tasks.sourceCheckboxIndex,
          })
      : await insertLegacyTasks(db, [taskValues])

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
      channelId,
      channelName,
      channelIsPrivate,
      title: inserted.title,
      description: parsed.data.description ?? null,
      status: inserted.status,
      priority: inserted.priority,
      dueDate: inserted.dueDate,
      assigneeId: inserted.assigneeId,
      assigneeName: assigneeRow?.displayName ?? null,
      assigneeAvatarUrl: assigneeRow?.avatarUrl ?? null,
      sourceMessageId,
      isCheckboxTask: false,
      isLinkedToMessage: sourceMessageId != null,
    }

    if (inserted.assigneeId) {
      await notifyTaskAssigned({
        workspaceId: ctx.workspaceId,
        assignerId: ctx.userId,
        assigneeId: inserted.assigneeId,
        taskId: inserted.id,
        taskTitle: inserted.title,
        projectId: inserted.projectId,
        scopeTitle: projectTitle ?? channelName ?? '',
      })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('[POST /api/tasks] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
