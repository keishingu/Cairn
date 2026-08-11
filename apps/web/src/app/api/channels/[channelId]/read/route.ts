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
    const { channelReadStates, messages, notifications } = await import('@cairn/db')
    const { eq, and, isNull, desc, inArray, sql } = await import('drizzle-orm')

    const [latest] = await db
      .select({ id: messages.id, createdAt: messages.createdAt })
      .from(messages)
      .where(and(eq(messages.channelId, channelId), isNull(messages.deletedAt)))
      .orderBy(desc(messages.createdAt))
      .limit(1)
    const now = new Date()
    const lastReadAt = latest?.createdAt ?? now

    await db.transaction(async (tx) => {
      await tx
        .insert(channelReadStates)
        .values({
          userId: ctx.userId,
          channelId,
          lastReadAt,
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

      const keepCurrent = current.lastReadAt.getTime() > lastReadAt.getTime()
      const effectiveLastReadAt = keepCurrent ? current.lastReadAt : lastReadAt
      const effectiveLastReadMessageId = keepCurrent
        ? current.lastReadMessageId
        : (latest?.id ?? null)

      if (effectiveLastReadMessageId) {
        // 取得したメッセージまでを既読にし、スナップショット後の新着通知は残す。
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
                and ${messages.createdAt} <= ${effectiveLastReadAt}
            )`,
          ))
      }

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
