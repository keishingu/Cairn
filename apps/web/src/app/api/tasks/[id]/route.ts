// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { updateTaskSchema } from '@cairn/shared'
import type { TaskDto } from '@/app/api/tasks/route'
import { buildMentionNameMap } from '@/lib/chat/mention-name-map'
import { hydrateMentions } from '@/lib/chat/mentions'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'
import { requireChannelAccess, requireProjectAccess, requireRole } from '@/lib/permissions'
import { isAssignableTaskMember, notifyTaskAssigned } from '@/lib/tasks/assignment-notification'
import { hasTaskChannelSchema } from '@/lib/tasks/schema-readiness'

export interface TaskDetailSourceMessageDto {
  id: string
  channelId: string
  /** メンションは読み時に表示名へ解決済み。 */
  content: string
  senderName: string
  senderAvatarUrl: string | null
  createdAt: string
}

export type TaskDetailDto = TaskDto & {
  description: string | null
  createdAt: string
  createdByName: string | null
  /** 出典メッセージ。紐付けなし・削除済み・閲覧できないチャンネルのものは null。 */
  sourceMessage: TaskDetailSourceMessageDto | null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const { db } = await import('@cairn/db')
    const { tasks, projects, channels, profiles, workspaceMembers, messages } = await import('@cairn/db')
    const { eq, and, isNull, sql } = await import('drizzle-orm')
    const { getAuthContext } = await import('@/lib/get-auth-context')

    const { ctx, error } = await getAuthContext({
      allowApiToken: true,
      requiredApiTokenScope: 'read',
    })
    if (error) return error
    const channelSchemaReady = await hasTaskChannelSchema(db)

    const [row] = await db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        projectTitle: projects.title,
        channelId: channelSchemaReady ? tasks.channelId : sql<string | null>`null`,
        channelName: channelSchemaReady ? channels.name : sql<string | null>`null`,
        channelType: channelSchemaReady ? channels.type : sql<'workspace' | 'project' | 'dm' | null>`null`,
        channelIsPrivate: channelSchemaReady ? channels.isPrivate : sql<boolean>`false`,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        assigneeId: tasks.assigneeId,
        sourceMessageId: tasks.sourceMessageId,
        createdBy: tasks.createdBy,
        createdAt: tasks.createdAt,
        assigneeName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
        assigneeAvatarUrl: workspaceMembers.avatarUrl,
      })
      .from(tasks)
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .leftJoin(channels, channelSchemaReady ? eq(tasks.channelId, channels.id) : sql`false`)
      .leftJoin(profiles, eq(tasks.assigneeId, profiles.id))
      .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, tasks.assigneeId), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
      .where(and(eq(tasks.id, id), eq(tasks.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!row) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (!channelSchemaReady && row.sourceMessageId && !row.projectId) {
      return NextResponse.json({ error: 'チャンネルタスクを準備中です' }, { status: 503 })
    }

    // 認可は PATCH と同じ。チャンネルの公開範囲（private / DM は参加者のみ）は requireChannelAccess が判定し、
    // 一覧の taskChannelVisibilityCondition と同じ範囲になる。
    if (row.channelId) {
      const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, row.channelId, ctx.role)
      if (forbidden) return forbidden
    } else if (row.projectId) {
      const forbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, row.projectId, ctx.role)
      if (forbidden) return forbidden
    } else {
      const forbidden = requireRole(ctx.role, 'member')
      if (forbidden) return forbidden
    }

    // 行為者の表示名は履歴上の名義を残すため workspace_members を直接引く（非活性でも消さない）。
    const [creator] = await db
      .select({ name: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName) })
      .from(profiles)
      .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
      .where(eq(profiles.id, row.createdBy))
      .limit(1)

    let sourceMessage: TaskDetailSourceMessageDto | null = null
    if (row.sourceMessageId) {
      const [message] = await db
        .select({
          id: messages.id,
          channelId: messages.channelId,
          content: messages.content,
          senderName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
          senderAvatarUrl: workspaceMembers.avatarUrl,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .innerJoin(channels, eq(messages.channelId, channels.id))
        .innerJoin(profiles, eq(messages.senderId, profiles.id))
        .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, messages.senderId), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
        .where(and(
          eq(messages.id, row.sourceMessageId),
          eq(channels.workspaceId, ctx.workspaceId),
          isNull(messages.deletedAt),
        ))
        .limit(1)

      // タスクのチャンネルと出典のチャンネルが違う場合（旧データなど）は、出典側の閲覧権も確認する。
      // 見えないなら本文を返さず null にする（タスク自体は閲覧できるため 403 にはしない）。
      let messageVisible = message != null
      if (message && message.channelId !== row.channelId) {
        const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, message.channelId, ctx.role)
        messageVisible = !forbidden
      }

      if (message && messageVisible) {
        const nameMap = await buildMentionNameMap(ctx.workspaceId, [message.content])
        sourceMessage = {
          id: message.id,
          channelId: message.channelId,
          content: hydrateMentions(message.content, (mentionId) => nameMap.get(mentionId)),
          senderName: message.senderName,
          senderAvatarUrl: message.senderAvatarUrl ?? null,
          createdAt: message.createdAt.toISOString(),
        }
      }
    }

    const result: TaskDetailDto = {
      id: row.id,
      projectId: row.projectId,
      projectTitle: row.projectTitle ?? null,
      channelId: row.channelId,
      channelName: row.channelName ?? null,
      channelType: row.channelType ?? null,
      channelIsPrivate: row.channelIsPrivate ?? false,
      title: row.title,
      status: row.status,
      priority: row.priority,
      dueDate: row.dueDate,
      assigneeId: row.assigneeId,
      assigneeName: row.assigneeName ?? null,
      assigneeAvatarUrl: row.assigneeAvatarUrl ?? null,
      sourceMessageId: row.sourceMessageId,
      isLinkedToMessage: row.sourceMessageId != null,
      hasDescription: row.description != null && row.description !== '',
      description: row.description,
      createdAt: row.createdAt.toISOString(),
      createdByName: creator?.name ?? null,
      sourceMessage,
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/tasks/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = updateTaskSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { aiNudges, tasks, projects, channels } = await import('@cairn/db')
    const { eq, and, sql } = await import('drizzle-orm')
    const { getAuthContext } = await import('@/lib/get-auth-context')

    const { ctx, error } = await getAuthContext({
      allowApiToken: true,
      requiredApiTokenScope: 'write',
    })
    if (error) return error
    const channelSchemaReady = await hasTaskChannelSchema(db)

    // タスクが自ワークスペースに属するか確認（IDOR対策）。project 未所属もあるため projects は leftJoin。
    const [taskRow] = await db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        channelId: channelSchemaReady ? tasks.channelId : sql<string | null>`null`,
        projectTitle: projects.title,
        channelName: channelSchemaReady ? channels.name : sql<string | null>`null`,
        title: tasks.title,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        status: tasks.status,
        assigneeId: tasks.assigneeId,
        sourceMessageId: tasks.sourceMessageId,
      })
      .from(tasks)
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .leftJoin(channels, channelSchemaReady ? eq(tasks.channelId, channels.id) : sql`false`)
      .where(and(eq(tasks.id, id), eq(tasks.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!taskRow) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (!channelSchemaReady && taskRow.sourceMessageId && !taskRow.projectId) {
      return NextResponse.json({ error: 'チャンネルタスクを準備中です' }, { status: 503 })
    }

    if (taskRow.channelId) {
      const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, taskRow.channelId, ctx.role)
      if (forbidden) return forbidden
    } else if (taskRow.projectId) {
      const forbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, taskRow.projectId, ctx.role)
      if (forbidden) return forbidden
    } else {
      // プロジェクト未所属タスクは member 以上のみ編集可
      const forbidden = requireRole(ctx.role, 'member')
      if (forbidden) return forbidden
    }

    // 担当者は「実際に変更されたとき」だけ検証する。既存の担当者が後から非活性化しても、
    // タイトル等の編集で同じ assigneeId を送り直すたびに 422 になるのを防ぐ（履歴は保持）。
    // null は担当者解除なので検証不要。新しい担当者は本人がそのタスクを見られる範囲に限定する。
    const assigneeChanged =
      parsed.data.assigneeId !== undefined && parsed.data.assigneeId !== taskRow.assigneeId
    if (assigneeChanged && parsed.data.assigneeId != null) {
      if (!(await isAssignableTaskMember(ctx.workspaceId, parsed.data.assigneeId, taskRow.projectId, taskRow.channelId))) {
        return NextResponse.json(
          { error: '指定された担当者はこのタスクに割り当てできません' },
          { status: 422 },
        )
      }
    }

    const updates: {
      title?: string
      description?: string | null
      priority?: 'high' | 'medium' | 'low'
      dueDate?: string | null
      status?: 'todo' | 'in_progress' | 'done'
      assigneeId?: string | null
      updatedAt: Date
    } = { updatedAt: new Date() }
    if (parsed.data.title !== undefined) updates.title = parsed.data.title
    if (parsed.data.description !== undefined) {
      // 空文字は「説明なし」と同じ扱いにして null に正規化する（hasDescription の判定を単純にする）
      updates.description = parsed.data.description === '' ? null : parsed.data.description
    }
    if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority
    if (parsed.data.dueDate !== undefined) updates.dueDate = parsed.data.dueDate
    if (parsed.data.status !== undefined) updates.status = parsed.data.status
    if (parsed.data.assigneeId !== undefined) updates.assigneeId = parsed.data.assigneeId

    const [updated] = await db
      .update(tasks)
      .set(updates)
      .where(eq(tasks.id, id))
      .returning({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        status: tasks.status,
        assigneeId: tasks.assigneeId,
        sourceMessageId: tasks.sourceMessageId,
      })

    if (!updated) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // 完了経路（タスク一覧・AIカード）を問わず、そのタスクの
    // activeナッジを即時解消する。status更新triggerが対応するベル通知も削除する。
    if (updated.status === 'done') {
      await db
        .update(aiNudges)
        .set({ status: 'resolved', remindAfter: null })
        .where(and(
          eq(aiNudges.workspaceId, ctx.workspaceId),
          eq(aiNudges.taskId, id),
          eq(aiNudges.status, 'active'),
        ))
    }

    // 担当者が新たに（自分以外へ）割り当てられたら通知する
    if (
      parsed.data.assigneeId !== undefined &&
      updated.assigneeId != null &&
      updated.assigneeId !== taskRow.assigneeId
    ) {
      await notifyTaskAssigned({
        workspaceId: ctx.workspaceId,
        assignerId: ctx.userId,
        assigneeId: updated.assigneeId,
        taskId: updated.id,
        taskTitle: updated.title,
        projectId: taskRow.projectId,
        scopeTitle: taskRow.projectTitle ?? taskRow.channelName ?? '',
      })
    }

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[PATCH /api/tasks/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const { db } = await import('@cairn/db')
    const { aiNudges, tasks } = await import('@cairn/db')
    const { eq, and, sql } = await import('drizzle-orm')
    const { getAuthContext } = await import('@/lib/get-auth-context')

    const { ctx, error } = await getAuthContext()
    if (error) return error
    const channelSchemaReady = await hasTaskChannelSchema(db)

    const [taskRow] = await db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        channelId: channelSchemaReady ? tasks.channelId : sql<string | null>`null`,
        sourceMessageId: tasks.sourceMessageId,
      })
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!taskRow) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (!channelSchemaReady && taskRow.sourceMessageId && !taskRow.projectId) {
      return NextResponse.json({ error: 'チャンネルタスクを準備中です' }, { status: 503 })
    }

    if (taskRow.channelId) {
      const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, taskRow.channelId, ctx.role)
      if (forbidden) return forbidden
    } else if (taskRow.projectId) {
      const forbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, taskRow.projectId, ctx.role)
      if (forbidden) return forbidden
    } else {
      const forbidden = requireRole(ctx.role, 'member')
      if (forbidden) return forbidden
    }

    const [deleted] = await db.transaction(async (tx) => {
      // FKのON DELETE SET NULLで参照履歴は保ちつつ、削除前に表示中の催促を解消する。
      // status更新triggerにより、対応するベル通知も同一トランザクション内で削除される。
      await tx
        .update(aiNudges)
        .set({ status: 'resolved', remindAfter: null })
        .where(
          and(
            eq(aiNudges.workspaceId, ctx.workspaceId),
            eq(aiNudges.taskId, id),
            eq(aiNudges.status, 'active'),
          ),
        )

      return tx
        .delete(tasks)
        .where(eq(tasks.id, id))
        .returning({ id: tasks.id })
    })

    if (!deleted) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json(deleted)
  } catch (err) {
    console.error('[DELETE /api/tasks/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
