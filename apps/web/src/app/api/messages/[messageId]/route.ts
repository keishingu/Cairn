// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { editMessageSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { parseCheckboxes } from '@/lib/chat/checkboxes'
import { canonicalizeMentions } from '@/lib/chat/mentions'

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

  const parsed = editMessageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  // 編集本文も canonical 形式に正規化（read 時に埋め込んだ表示名が再保存されても剥がす）
  const content = canonicalizeMentions(parsed.data.content)

  try {
    const { db } = await import('@cairn/db')
    const { messages, channels } = await import('@cairn/db')
    const { eq, and, isNull, inArray } = await import('drizzle-orm')

    // 送信者・ワークスペース・削除済み除外をすべて確認してから更新
    const [target] = await db
      .select({ id: messages.id, content: messages.content })
      .from(messages)
      .innerJoin(channels, eq(messages.channelId, channels.id))
      .where(and(
        eq(messages.id, messageId),
        eq(messages.senderId, ctx.userId),
        eq(channels.workspaceId, ctx.workspaceId),
        isNull(messages.deletedAt),
      ))
      .limit(1)

    if (!target) {
      return NextResponse.json({ error: 'メッセージが見つからないか編集権限がありません' }, { status: 404 })
    }

    const [updated] = await db
      .update(messages)
      .set({ content, updatedAt: new Date() })
      .where(eq(messages.id, messageId))
      .returning({ id: messages.id, content: messages.content })

    // チェックボックスの変化に応じてタスクを同期
    const { tasks, channels: channelsTable } = await import('@cairn/db')
    const oldBoxes = parseCheckboxes(target.content)
    const newBoxes = parseCheckboxes(content)

    // 削除されたチェックボックスのタスクを一括削除
    const newIndices = new Set(newBoxes.map(b => b.index))
    const removedIndices = oldBoxes.filter(b => !newIndices.has(b.index)).map(b => b.index)
    if (removedIndices.length > 0) {
      await db.delete(tasks).where(and(
        eq(tasks.sourceMessageId, messageId),
        inArray(tasks.sourceCheckboxIndex, removedIndices),
      ))
    }

    // 追加・変更されたチェックボックスをupsert
    if (newBoxes.length > 0) {
      const [ch] = await db
        .select({ projectId: channelsTable.projectId })
        .from(messages)
        .innerJoin(channelsTable, eq(messages.channelId, channelsTable.id))
        .where(eq(messages.id, messageId))
        .limit(1)

      if (ch?.projectId) {
        const projectId = ch.projectId

        // 新規チェックボックスを一括インサート
        const newToInsert = newBoxes.filter(nb => !oldBoxes.some(ob => ob.index === nb.index))
        if (newToInsert.length > 0) {
          await db.insert(tasks).values(
            newToInsert.map(nb => ({
              projectId,
              title: nb.text,
              status: (nb.checked ? 'done' : 'todo') as 'done' | 'todo',
              priority: 'medium' as const,
              createdBy: ctx.userId,
              sourceMessageId: messageId,
              sourceCheckboxIndex: nb.index,
            })),
          )
        }

        // タイトルまたはチェック状態が変わった既存チェックボックスを並列更新（N+1 を避けるため Promise.all）
        const changedBoxes = newBoxes.filter(nb => {
          const existing = oldBoxes.find(ob => ob.index === nb.index)
          return existing && (existing.text !== nb.text || existing.checked !== nb.checked)
        })
        if (changedBoxes.length > 0) {
          await Promise.all(
            changedBoxes.map(nb =>
              db.update(tasks)
                .set({ title: nb.text, status: nb.checked ? 'done' : 'todo', updatedAt: new Date() })
                .where(and(
                  eq(tasks.sourceMessageId, messageId),
                  eq(tasks.sourceCheckboxIndex, nb.index),
                )),
            ),
          )
        }
      }
    }

    return NextResponse.json({ id: updated!.id, content: updated!.content })
  } catch (err) {
    console.error('[/api/messages/[messageId] PATCH] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { messageId } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  try {
    const { db } = await import('@cairn/db')
    const { messages, channels } = await import('@cairn/db')
    const { eq, and, isNull } = await import('drizzle-orm')

    // 送信者・ワークスペーススコープを確認してからソフトデリート
    const [target] = await db
      .select({ id: messages.id })
      .from(messages)
      .innerJoin(channels, eq(messages.channelId, channels.id))
      .where(and(
        eq(messages.id, messageId),
        eq(messages.senderId, ctx.userId),
        eq(channels.workspaceId, ctx.workspaceId),
        isNull(messages.deletedAt),
      ))
      .limit(1)

    if (!target) {
      return NextResponse.json({ error: 'メッセージが見つからないか削除権限がありません' }, { status: 404 })
    }

    await db
      .update(messages)
      .set({ deletedAt: new Date() })
      .where(eq(messages.id, messageId))

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[/api/messages/[messageId] DELETE] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
