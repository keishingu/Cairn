// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'

type RouteContext = { params: Promise<{ channelId: string }> }

export async function POST(_req: Request, { params }: RouteContext) {
  const { channelId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId, ctx.role)
  if (forbidden) return forbidden

  try {
    const { db } = await import('@cairn/db')
    const { channelReadStates, channels, messages, notifications } = await import('@cairn/db')
    const { eq, and, isNull, desc, inArray, sql } = await import('drizzle-orm')

    await db.transaction(async (tx) => {
      // 投稿トランザクションと直列化し、ここで見えたメッセージだけを既読対象にする。
      await tx
        .select({ id: channels.id })
        .from(channels)
        .where(eq(channels.id, channelId))
        .for('update')

      const [latest] = await tx
        .select({ id: messages.id, createdAt: messages.createdAt })
        .from(messages)
        .where(and(eq(messages.channelId, channelId), isNull(messages.deletedAt)))
        .orderBy(desc(messages.createdAt))
        .limit(1)
      const now = new Date()
      // 空チャンネルでは未来の最初のメッセージを既読にしない境界から始める。
      const selectedLastReadAt = latest?.createdAt ?? new Date(0)

      await tx
        .insert(channelReadStates)
        .values({
          userId: ctx.userId,
          channelId,
          lastReadAt: selectedLastReadAt,
          lastReadMessageId: latest?.id ?? null,
          unreadMentionCount: 0,
        })
        .onConflictDoNothing()

      const [current] = await tx
        .select({
          lastReadAt: channelReadStates.lastReadAt,
          lastReadMessageId: channelReadStates.lastReadMessageId,
        })
        .from(channelReadStates)
        .where(and(
          eq(channelReadStates.userId, ctx.userId),
          eq(channelReadStates.channelId, channelId),
        ))
        .for('update')
        .limit(1)
      if (!current) throw new Error('Channel read state was not created')

      const keepCurrent = !latest
        || current.lastReadAt.getTime() > selectedLastReadAt.getTime()
      const effectiveLastReadAt = keepCurrent ? current.lastReadAt : selectedLastReadAt
      const effectiveLastReadMessageId = keepCurrent
        ? current.lastReadMessageId
        : (latest?.id ?? null)

      // 取得したメッセージまでと、削除済みメッセージ由来の通知を既読にする。
      // 空チャンネルのスナップショット後に届いた最初のメッセージは残す。
      await tx
        .update(notifications)
        .set({ readAt: now })
        .where(and(
          eq(notifications.userId, ctx.userId),
          isNull(notifications.readAt),
          inArray(notifications.type, ['mention', 'dm']),
          sql`${notifications.data}->>'channelId' = ${channelId}`,
          sql`exists (
            select 1
            from ${messages}
            where ${messages.id}::text = ${notifications.data}->>'messageId'
              and (
                ${messages.deletedAt} is not null
                or (
                  ${effectiveLastReadMessageId !== null}
                  and ${messages.createdAt} <= ${effectiveLastReadAt}
                )
              )
          )`,
        ))

      await tx
        .update(channelReadStates)
        .set({
          lastReadAt: effectiveLastReadAt,
          lastReadMessageId: effectiveLastReadMessageId,
          unreadMentionCount: sql`(
            select count(*)::integer
            from ${notifications}
            where ${notifications.userId} = ${ctx.userId}
              and ${notifications.type} = 'mention'
              and ${notifications.readAt} is null
              and ${notifications.data}->>'channelId' = ${channelId}
          )`,
          updatedAt: now,
        })
        .where(and(
          eq(channelReadStates.userId, ctx.userId),
          eq(channelReadStates.channelId, channelId),
        ))
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/channels/[channelId]/read]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
