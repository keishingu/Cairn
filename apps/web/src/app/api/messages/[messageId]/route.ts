// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { editMessageSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
import { canExtractTasksFromChannel, parseCheckboxes } from '@/lib/chat/checkboxes'
import { canonicalizeMentions } from '@/lib/chat/mentions'
import { hasTaskChannelSchema, insertLegacyTasks } from '@/lib/tasks/schema-readiness'

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
    const { messages, channels, tasks } = await import('@cairn/db')
    const { eq, and, isNull, inArray } = await import('drizzle-orm')

    // 送信者・ワークスペース・削除済み除外をすべて確認してから更新
    const [target] = await db
      .select({
        id: messages.id,
        content: messages.content,
        channelId: messages.channelId,
        projectId: channels.projectId,
        channelType: channels.type,
      })
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

    const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, target.channelId, ctx.role)
    if (forbidden) return forbidden

    // チェックボックスの変化に応じてタスクを同期
    const oldBoxes = parseCheckboxes(target.content)
    const newBoxes = parseCheckboxes(content)
    const newIndices = new Set(newBoxes.map(b => b.index))
    const removedIndices = oldBoxes.filter(b => !newIndices.has(b.index)).map(b => b.index)
    const extractsTasks = canExtractTasksFromChannel(target.channelType)
    const newToInsert = extractsTasks
      ? newBoxes.filter(nb => !oldBoxes.some(ob => ob.index === nb.index))
      : []
    const changedBoxes = extractsTasks
      ? newBoxes.filter(nb => {
          const existing = oldBoxes.find(ob => ob.index === nb.index)
          return existing && (existing.text !== nb.text || existing.checked !== nb.checked)
        })
      : []
    const channelSchemaReady = newToInsert.length === 0 || await hasTaskChannelSchema(db)

    const updated = await db.transaction(async (tx) => {
      const [message] = await tx
        .update(messages)
        .set({ content, updatedAt: new Date() })
        .where(eq(messages.id, messageId))
        .returning({ id: messages.id, content: messages.content })

      if (!message) throw new Error('Update returned no rows')

      if (removedIndices.length > 0) {
        await tx.delete(tasks).where(and(
          eq(tasks.sourceMessageId, messageId),
          inArray(tasks.sourceCheckboxIndex, removedIndices),
        ))
      }

      if (newToInsert.length > 0) {
        const taskValues = newToInsert.map(nb => ({
          workspaceId: ctx.workspaceId,
          projectId: target.projectId,
          title: nb.text,
          status: (nb.checked ? 'done' : 'todo') as 'done' | 'todo',
          priority: 'medium' as const,
          createdBy: ctx.userId,
          sourceMessageId: messageId,
          sourceCheckboxIndex: nb.index,
        }))
        if (channelSchemaReady) {
          await tx.insert(tasks).values(taskValues.map(value => ({
            ...value,
            channelId: target.channelId,
          })))
        } else {
          await insertLegacyTasks(tx, taskValues)
        }
      }

      for (const nb of changedBoxes) {
        await tx.update(tasks)
          .set({ title: nb.text, status: nb.checked ? 'done' : 'todo', updatedAt: new Date() })
          .where(and(
            eq(tasks.sourceMessageId, messageId),
            eq(tasks.sourceCheckboxIndex, nb.index),
          ))
      }

      return message
    })

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
    const { messages, channels, tasks } = await import('@cairn/db')
    const { eq, and, isNull } = await import('drizzle-orm')

    // 送信者・ワークスペーススコープを確認してからソフトデリート
    const [target] = await db
      .select({ id: messages.id, channelId: messages.channelId })
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

    const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, target.channelId, ctx.role)
    if (forbidden) return forbidden

    // メッセージのソフトデリートと、そのチェックボックス由来タスクの削除を1トランザクションにする。
    // 片方だけ成功すると、メッセージは非表示なのにチャット由来タスク（単体削除不可）が
    // 消せないまま残る不整合になるため、両方まとめて成功/失敗させる。
    await db.transaction(async (tx) => {
      await tx
        .update(messages)
        .set({ deletedAt: new Date() })
        .where(eq(messages.id, messageId))

      await tx.delete(tasks).where(eq(tasks.sourceMessageId, messageId))
    })

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[/api/messages/[messageId] DELETE] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
