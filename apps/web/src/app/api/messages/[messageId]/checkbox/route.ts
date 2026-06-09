// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
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
    const { messages, channels, tasks } = await import('@cairn/db')
    const { eq, and, isNull } = await import('drizzle-orm')

    // ワークスペースメンバーならチェックボックス操作を許可（送信者以外も可）
    const [target] = await db
      .select({ id: messages.id, content: messages.content })
      .from(messages)
      .innerJoin(channels, eq(messages.channelId, channels.id))
      .where(and(
        eq(messages.id, messageId),
        eq(channels.workspaceId, ctx.workspaceId),
        isNull(messages.deletedAt),
      ))
      .limit(1)

    if (!target) {
      return NextResponse.json({ error: 'メッセージが見つかりません' }, { status: 404 })
    }

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
    await db
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

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[PATCH /api/messages/[messageId]/checkbox] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
