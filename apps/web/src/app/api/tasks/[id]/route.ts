// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import type { TaskDto } from '../route'
import { toggleCheckboxAt } from '@/lib/chat/checkboxes'

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

  const { status } = body as { status?: TaskDto['status'] }
  if (!status || !['todo', 'in_progress', 'done'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 422 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { tasks, projects } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')
    const { getAuthContext } = await import('@/lib/get-auth-context')

    const { ctx, error } = await getAuthContext()
    if (error) return error

    // タスクが自ワークスペースに属するか確認（IDOR対策）
    const [taskRow] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(eq(tasks.id, id), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!taskRow) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const [updated] = await db
      .update(tasks)
      .set({ status, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning({ id: tasks.id, sourceMessageId: tasks.sourceMessageId, sourceCheckboxIndex: tasks.sourceCheckboxIndex })

    if (!updated) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // チャットメッセージのチェックボックスに逆同期
    if (updated.sourceMessageId != null && updated.sourceCheckboxIndex != null) {
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
          return NextResponse.json({ id, status })
        }
      }

      if (msg) {
        const newContent = toggleCheckboxAt(
          msg.content,
          updated.sourceCheckboxIndex,
          status === 'done',
        )
        if (newContent !== msg.content) {
          await db
            .update(messages)
            .set({ content: newContent })
            .where(eq(messages.id, updated.sourceMessageId))
        }
      }
    }

    return NextResponse.json({ id, status })
  } catch (err) {
    console.error('[PATCH /api/tasks/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
