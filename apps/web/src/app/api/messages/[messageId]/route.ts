// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { editMessageSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
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
    const { eq, and, isNull } = await import('drizzle-orm')

    // 送信者・ワークスペース・削除済み除外をすべて確認してから更新
    const [target] = await db
      .select({
        id: messages.id,
        channelId: messages.channelId,
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

    const [updated] = await db
      .update(messages)
      .set({ content, updatedAt: new Date() })
      .where(eq(messages.id, messageId))
      .returning({ id: messages.id, content: messages.content })

    if (!updated) throw new Error('Update returned no rows')

    return NextResponse.json({ id: updated.id, content: updated.content })
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

    // メッセージのソフトデリートと、そのメッセージ由来タスクの削除を1トランザクションにする。
    // 片方だけ成功すると、メッセージは非表示なのにタスクだけ残る不整合になるため、
    // 両方まとめて成功/失敗させる。
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
