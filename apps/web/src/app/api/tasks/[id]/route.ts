// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { updateTaskSchema } from '@cairn/shared'
import { toggleCheckboxAt } from '@/lib/chat/checkboxes'
import { requireProjectAccess } from '@/lib/permissions'

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
    const { aiNudges, tasks, projects } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')
    const { getAuthContext } = await import('@/lib/get-auth-context')

    const { ctx, error } = await getAuthContext()
    if (error) return error

    // タスクが自ワークスペースに属するか確認（IDOR対策）
    const [taskRow] = await db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        title: tasks.title,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        status: tasks.status,
        sourceMessageId: tasks.sourceMessageId,
        sourceCheckboxIndex: tasks.sourceCheckboxIndex,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(eq(tasks.id, id), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!taskRow) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const forbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, taskRow.projectId)
    if (forbidden) return forbidden

    const updates: {
      title?: string
      priority?: 'high' | 'medium' | 'low'
      dueDate?: string | null
      status?: 'todo' | 'in_progress' | 'done'
      updatedAt: Date
    } = { updatedAt: new Date() }
    if (parsed.data.title !== undefined) updates.title = parsed.data.title
    if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority
    if (parsed.data.dueDate !== undefined) updates.dueDate = parsed.data.dueDate
    if (parsed.data.status !== undefined) updates.status = parsed.data.status

    const editsTaskContent = parsed.data.title !== undefined || parsed.data.priority !== undefined || parsed.data.dueDate !== undefined
    if (editsTaskContent && taskRow.sourceMessageId != null) {
      return NextResponse.json({ error: 'チャット由来タスクはこの画面から編集できません' }, { status: 409 })
    }

    const [updated] = await db
      .update(tasks)
      .set(updates)
      .where(eq(tasks.id, id))
      .returning({
        id: tasks.id,
        title: tasks.title,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        status: tasks.status,
        sourceMessageId: tasks.sourceMessageId,
        sourceCheckboxIndex: tasks.sourceCheckboxIndex,
      })

    if (!updated) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // 完了経路（タスク一覧・チャットのcheckbox・AIカード）を問わず、そのタスクの
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

    // チャットメッセージのチェックボックスに逆同期
    if (parsed.data.status !== undefined && updated.sourceMessageId != null && updated.sourceCheckboxIndex != null) {
      const { messages, channels, channelMembers } = await import('@cairn/db')
      const [msg] = await db
        .select({ content: messages.content, channelId: messages.channelId, isPrivate: channels.isPrivate })
        .from(messages)
        .innerJoin(channels, eq(messages.channelId, channels.id))
        .where(and(eq(messages.id, updated.sourceMessageId), eq(channels.workspaceId, ctx.workspaceId)))
        .limit(1)

      if (msg?.isPrivate) {
        const [membership] = await db
          .select({ userId: channelMembers.userId })
          .from(channelMembers)
          .where(and(eq(channelMembers.channelId, msg.channelId), eq(channelMembers.userId, ctx.userId)))
          .limit(1)
        if (!membership) {
          return NextResponse.json(updated)
        }
      }

      if (msg) {
        const newContent = toggleCheckboxAt(
          msg.content,
          updated.sourceCheckboxIndex,
          updated.status === 'done',
        )
        if (newContent !== msg.content) {
          await db
            .update(messages)
            .set({ content: newContent })
            .where(eq(messages.id, updated.sourceMessageId))
        }
      }
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
    const { aiNudges, tasks, projects } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')
    const { getAuthContext } = await import('@/lib/get-auth-context')

    const { ctx, error } = await getAuthContext()
    if (error) return error

    const [taskRow] = await db
      .select({ id: tasks.id, projectId: tasks.projectId, sourceMessageId: tasks.sourceMessageId })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(eq(tasks.id, id), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!taskRow) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const forbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, taskRow.projectId)
    if (forbidden) return forbidden

    if (taskRow.sourceMessageId != null) {
      return NextResponse.json({ error: 'チャット由来タスクはこの画面から削除できません' }, { status: 409 })
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
