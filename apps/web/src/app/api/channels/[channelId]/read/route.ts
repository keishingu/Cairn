// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

type RouteContext = { params: Promise<{ channelId: string }> }

export async function POST(_req: Request, { params }: RouteContext) {
  const { channelId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db } = await import('@cairn/db')
    const { channelReadStates, messages, notifications } = await import('@cairn/db')
    const { eq, and, isNull, desc, inArray, sql } = await import('drizzle-orm')

    const [latest] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.channelId, channelId), isNull(messages.deletedAt)))
      .orderBy(desc(messages.createdAt))
      .limit(1)

    await db
      .insert(channelReadStates)
      .values({
        userId: ctx.userId,
        channelId,
        lastReadAt: new Date(),
        lastReadMessageId: latest?.id ?? null,
        unreadMentionCount: 0,
      })
      .onConflictDoUpdate({
        target: [channelReadStates.userId, channelReadStates.channelId],
        set: {
          lastReadAt: new Date(),
          lastReadMessageId: latest?.id ?? null,
          unreadMentionCount: 0,
          updatedAt: new Date(),
        },
      })

    // チャンネルを読んだらベルのメンション/DM 通知も既読にする（既読状態を2系統に分裂させない）
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(
        eq(notifications.userId, ctx.userId),
        isNull(notifications.readAt),
        inArray(notifications.type, ['mention', 'dm']),
        sql`${notifications.data}->>'channelId' = ${channelId}`,
      ))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/channels/[channelId]/read]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
