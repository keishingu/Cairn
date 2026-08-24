// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { updateTaskSchema } from '@cairn/shared'
import { replaceCheckboxLabelAt, toggleCheckboxAt } from '@/lib/chat/checkboxes'
import { requireChannelAccess, requireProjectAccess, requireRole } from '@/lib/permissions'
import { isAssignableTaskMember, notifyTaskAssigned } from '@/lib/tasks/assignment-notification'

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
    const { eq, and } = await import('drizzle-orm')
    const { getAuthContext } = await import('@/lib/get-auth-context')

    const { ctx, error } = await getAuthContext({
      allowApiToken: true,
      requiredApiTokenScope: 'write',
    })
    if (error) return error

    // タスクが自ワークスペースに属するか確認（IDOR対策）。project 未所属もあるため projects は leftJoin。
    const [taskRow] = await db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        channelId: tasks.channelId,
        projectTitle: projects.title,
        channelName: channels.name,
        title: tasks.title,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        status: tasks.status,
        assigneeId: tasks.assigneeId,
        sourceMessageId: tasks.sourceMessageId,
        sourceCheckboxIndex: tasks.sourceCheckboxIndex,
      })
      .from(tasks)
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .leftJoin(channels, eq(tasks.channelId, channels.id))
      .where(and(eq(tasks.id, id), eq(tasks.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!taskRow) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
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
      priority?: 'high' | 'medium' | 'low'
      dueDate?: string | null
      status?: 'todo' | 'in_progress' | 'done'
      assigneeId?: string | null
      updatedAt: Date
    } = { updatedAt: new Date() }
    if (parsed.data.title !== undefined) updates.title = parsed.data.title
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
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        status: tasks.status,
        assigneeId: tasks.assigneeId,
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

    // チャットメッセージのチェックボックスへ逆同期する。
    // - status 変更: チェック状態を toggle
    // - title 変更: チェックボックスの文言を replace（タスクと元メッセージの紐付けを維持する）
    const titleChanged = parsed.data.title !== undefined && updated.title !== taskRow.title
    const statusChanged = parsed.data.status !== undefined
    if ((titleChanged || statusChanged) && updated.sourceMessageId != null && updated.sourceCheckboxIndex != null) {
      const { messages, channels } = await import('@cairn/db')
      const [msg] = await db
        .select({
          content: messages.content,
          channelId: messages.channelId,
          senderId: messages.senderId,
        })
        .from(messages)
        .innerJoin(channels, eq(messages.channelId, channels.id))
        .where(and(eq(messages.id, updated.sourceMessageId), eq(channels.workspaceId, ctx.workspaceId)))
        .limit(1)

      if (msg) {
        let newContent = msg.content
        if (statusChanged) {
          // チェック状態の toggle は共同作業の基本操作なので投稿者以外でも反映する
          newContent = toggleCheckboxAt(newContent, updated.sourceCheckboxIndex, updated.status === 'done')
        }
        // 文言の書き換えは「他人のメッセージ本文を書き換える」操作になるため、
        // 通常のメッセージ編集（senderId === 本人）と同じ所有権ルールに合わせ、投稿者本人のみに限定する。
        // 投稿者以外がタイトルを変えた場合はタスク側のみ反映し、チェックボックス文言は据え置く。
        if (titleChanged && msg.senderId === ctx.userId) {
          newContent = replaceCheckboxLabelAt(newContent, updated.sourceCheckboxIndex, updated.title)
        }
        if (newContent !== msg.content) {
          await db
            .update(messages)
            .set({ content: newContent })
            .where(eq(messages.id, updated.sourceMessageId))
        }
      }
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
    const { eq, and } = await import('drizzle-orm')
    const { getAuthContext } = await import('@/lib/get-auth-context')

    const { ctx, error } = await getAuthContext()
    if (error) return error

    const [taskRow] = await db
      .select({ id: tasks.id, projectId: tasks.projectId, channelId: tasks.channelId, sourceMessageId: tasks.sourceMessageId })
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!taskRow) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
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

    // チャット由来タスクは単体削除しない。紐付いたチャットメッセージ（またはチェックボックス行）を
    // 消したときにタスクも消える運用のため、ここでは 409 で拒否する。
    if (taskRow.sourceMessageId != null) {
      return NextResponse.json(
        { error: 'チャット由来タスクは単体で削除できません。元のチャットメッセージ側で削除してください' },
        { status: 409 },
      )
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
