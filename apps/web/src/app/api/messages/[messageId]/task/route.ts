// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
import { buildMentionNameMap } from '@/lib/chat/mention-name-map'
import { hasTaskChannelSchema } from '@/lib/tasks/schema-readiness'
import { taskTitleFromMessage } from '@/lib/tasks/title-from-message'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'
import type { TaskDto } from '@/app/api/tasks/route'

type RouteContext = { params: Promise<{ messageId: string }> }

export type MessageTaskResponse = TaskDto & { created: boolean }

// メッセージを出典とするタスクを作る。同じメッセージのタスクが既にあれば新規作成せずそれを返す。
export async function POST(_req: Request, { params }: RouteContext) {
  const { messageId } = await params
  const { ctx, error: authError } = await getAuthContext({
    allowApiToken: true,
    requiredApiTokenScope: 'write',
  })
  if (authError) return authError

  try {
    const { db, messages, channels, tasks, projects, profiles, workspaceMembers } = await import('@cairn/db')
    const { and, eq, isNull, asc } = await import('drizzle-orm')

    const [message] = await db
      .select({
        id: messages.id,
        content: messages.content,
        messageType: messages.messageType,
        channelId: messages.channelId,
        projectId: channels.projectId,
      })
      .from(messages)
      .innerJoin(channels, eq(messages.channelId, channels.id))
      .where(and(
        eq(messages.id, messageId),
        eq(channels.workspaceId, ctx.workspaceId),
        isNull(messages.deletedAt),
      ))
      .limit(1)

    if (!message || message.messageType === 'system') {
      return NextResponse.json({ error: 'メッセージが見つかりません' }, { status: 404 })
    }

    const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, message.channelId, ctx.role)
    if (forbidden) return forbidden

    if (!(await hasTaskChannelSchema(db))) {
      return NextResponse.json({ error: 'チャンネルタスクを準備中です' }, { status: 503 })
    }

    const taskSelect = {
      id: tasks.id,
      projectId: tasks.projectId,
      projectTitle: projects.title,
      channelId: tasks.channelId,
      channelName: channels.name,
      channelType: channels.type,
      channelIsPrivate: channels.isPrivate,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      assigneeId: tasks.assigneeId,
      sourceMessageId: tasks.sourceMessageId,
      assigneeName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
      assigneeAvatarUrl: workspaceMembers.avatarUrl,
    }
    const loadTask = async (taskId?: string) => {
      const [row] = await db
        .select(taskSelect)
        .from(tasks)
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .leftJoin(channels, eq(tasks.channelId, channels.id))
        .leftJoin(profiles, eq(tasks.assigneeId, profiles.id))
        .leftJoin(workspaceMembers, and(
          eq(workspaceMembers.userId, tasks.assigneeId),
          eq(workspaceMembers.workspaceId, ctx.workspaceId),
        ))
        .where(and(
          eq(tasks.workspaceId, ctx.workspaceId),
          taskId ? eq(tasks.id, taskId) : eq(tasks.sourceMessageId, messageId),
        ))
        .orderBy(asc(tasks.createdAt))
        .limit(1)
      return row
    }
    const toDto = (row: NonNullable<Awaited<ReturnType<typeof loadTask>>>, created: boolean): MessageTaskResponse => ({
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
      created,
    })

    // 重複作成防止: 既にタスク化済みなら、そのタスクを返す。
    const existing = await loadTask()
    if (existing) return NextResponse.json(toDto(existing, false), { status: 200 })

    const nameMap = await buildMentionNameMap(ctx.workspaceId, [message.content])
    const title = taskTitleFromMessage(message.content, id => nameMap.get(id))
    if (!title) {
      return NextResponse.json({ error: '本文のないメッセージはタスクにできません' }, { status: 422 })
    }

    const [inserted] = await db
      .insert(tasks)
      .values({
        workspaceId: ctx.workspaceId,
        projectId: message.projectId,
        channelId: message.channelId,
        title,
        priority: 'medium',
        status: 'todo',
        createdBy: ctx.userId,
        sourceMessageId: messageId,
        assigneeId: null,
      })
      // 同時リクエストで先に作られていたら一意制約で何も挿入されないので、勝った方のタスクを返す。
      // 対象列を指定しないのは、マイグレーション適用前に新コードが動いても ON CONFLICT が失敗しないため。
      .onConflictDoNothing()
      .returning({ id: tasks.id })
    if (!inserted) {
      const winner = await loadTask()
      if (!winner) throw new Error('Insert returned no rows')
      return NextResponse.json(toDto(winner, false), { status: 200 })
    }

    const created = await loadTask(inserted.id)
    if (!created) throw new Error('Created task not found')
    return NextResponse.json(toDto(created, true), { status: 201 })
  } catch (err) {
    console.error('[/api/messages/[messageId]/task POST] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
