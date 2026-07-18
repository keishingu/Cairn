// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
import { toggleCheckboxAt } from '@/lib/chat/checkboxes'

const bodySchema = z.object({
  index: z.number().int().min(0),
  checked: z.boolean(),
})

type RouteContext = { params: Promise<{ messageId: string }> }

export async function PATCH(req: Request, { params }: RouteContext) {
  const { messageId } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { index, checked } = parsed.data

  try {
    const { db } = await import('@cairn/db')
    const { aiNudges, messages, tasks } = await import('@cairn/db')
    const { eq, and, inArray, isNull } = await import('drizzle-orm')

    const [target] = await db
      .select({ content: messages.content, channelId: messages.channelId })
      .from(messages)
      .where(and(eq(messages.id, messageId), isNull(messages.deletedAt)))
      .limit(1)

    if (!target) {
      return NextResponse.json({ error: 'メッセージが見つかりません' }, { status: 404 })
    }

    // チャンネルへのアクセス権を検証（越境アクセス防止・プライベート/DM/ゲストのプロジェクト所属）
    const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, target.channelId)
    if (forbidden) return forbidden

    const newContent = toggleCheckboxAt(target.content, index, checked)
    if (newContent === target.content) {
      return NextResponse.json({ ok: true })
    }

    // updatedAt を変えずにチェックボックス変更（「編集済み」表示を避けるため）
    await db
      .update(messages)
      .set({ content: newContent })
      .where(eq(messages.id, messageId))

    // 紐付きタスクのステータスを同期
    const syncedTasks = await db
      .update(tasks)
      .set({
        status: checked ? 'done' : 'todo',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tasks.sourceMessageId, messageId),
          eq(tasks.sourceCheckboxIndex, index),
        ),
      )
      .returning({ id: tasks.id })

    if (checked && syncedTasks.length > 0) {
      await db
        .update(aiNudges)
        .set({ status: 'resolved', remindAfter: null })
        .where(
          and(
            eq(aiNudges.workspaceId, ctx.workspaceId),
            inArray(
              aiNudges.taskId,
              syncedTasks.map(task => task.id),
            ),
            eq(aiNudges.status, 'active'),
          ),
        )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[PATCH /api/messages/[messageId]/checkbox] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
