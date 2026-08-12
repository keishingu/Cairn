// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { editMessageSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
import { parseCheckboxes } from '@/lib/chat/checkboxes'
import { canonicalizeMentions } from '@/lib/chat/mentions'
import { runForActiveMembership } from '@/lib/access/active-membership-lock'

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

    const { tasks, channels: channelsTable } = await import('@cairn/db')
    const response = await runForActiveMembership(db, ctx.workspaceId, ctx.userId, async (tx) => {
      // membership共有ロック取得後に削除状態を再確認する。退会匿名化が先に
      // commitした場合、待機していた編集が本文や派生タスクを復活させない。
      const [target] = await tx
        .select({ id: messages.id, content: messages.content, channelId: messages.channelId })
        .from(messages)
        .innerJoin(channels, eq(messages.channelId, channels.id))
        .where(
          and(
            eq(messages.id, messageId),
            eq(messages.senderId, ctx.userId),
            eq(channels.workspaceId, ctx.workspaceId),
            isNull(messages.deletedAt),
          ),
        )
        .limit(1)

      if (!target) {
        return NextResponse.json(
          { error: 'メッセージが見つからないか編集権限がありません' },
          { status: 404 },
        )
      }

      const forbidden = await requireChannelAccess(
        ctx.workspaceId,
        ctx.userId,
        target.channelId,
        ctx.role,
      )
      if (forbidden) return forbidden

      const [updated] = await tx
        .update(messages)
        .set({ content, updatedAt: new Date() })
        .where(and(eq(messages.id, messageId), isNull(messages.deletedAt)))
        .returning({ id: messages.id, content: messages.content })
      if (!updated) {
        return NextResponse.json(
          { error: 'メッセージが見つからないか編集権限がありません' },
          { status: 404 },
        )
      }

      const oldBoxes = parseCheckboxes(target.content)
      const newBoxes = parseCheckboxes(content)
      const newIndices = new Set(newBoxes.map((box) => box.index))
      const removedIndices = oldBoxes
        .filter((box) => !newIndices.has(box.index))
        .map((box) => box.index)
      if (removedIndices.length > 0) {
        await tx
          .delete(tasks)
          .where(
            and(
              eq(tasks.sourceMessageId, messageId),
              inArray(tasks.sourceCheckboxIndex, removedIndices),
            ),
          )
      }

      if (newBoxes.length > 0) {
        const [channel] = await tx
          .select({ projectId: channelsTable.projectId })
          .from(messages)
          .innerJoin(channelsTable, eq(messages.channelId, channelsTable.id))
          .where(eq(messages.id, messageId))
          .limit(1)

        if (channel?.projectId) {
          const projectId = channel.projectId
          const newToInsert = newBoxes.filter(
            (box) => !oldBoxes.some((oldBox) => oldBox.index === box.index),
          )
          if (newToInsert.length > 0) {
            await tx.insert(tasks).values(
              newToInsert.map((box) => ({
                workspaceId: ctx.workspaceId,
                projectId,
                title: box.text,
                status: (box.checked ? 'done' : 'todo') as 'done' | 'todo',
                priority: 'medium' as const,
                createdBy: ctx.userId,
                sourceMessageId: messageId,
                sourceCheckboxIndex: box.index,
              })),
            )
          }

          const changedBoxes = newBoxes.filter((box) => {
            const existing = oldBoxes.find((oldBox) => oldBox.index === box.index)
            return existing && (existing.text !== box.text || existing.checked !== box.checked)
          })
          if (changedBoxes.length > 0) {
            await Promise.all(
              changedBoxes.map((box) =>
                tx
                  .update(tasks)
                  .set({
                    title: box.text,
                    status: box.checked ? 'done' : 'todo',
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(tasks.sourceMessageId, messageId),
                      eq(tasks.sourceCheckboxIndex, box.index),
                    ),
                  ),
              ),
            )
          }
        }
      }

      return NextResponse.json({ id: updated.id, content: updated.content })
    })

    return (
      response ??
      NextResponse.json({ error: 'ワークスペースへのアクセス権がありません' }, { status: 403 })
    )
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
