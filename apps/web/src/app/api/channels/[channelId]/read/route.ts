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
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.channelId, channelId), isNull(messages.deletedAt)))
      .orderBy(desc(messages.createdAt))
      .limit(1)

    await db.transaction(async (tx) => {
      await tx
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

      // read state 行のロックを通知更新まで保持し、後発のメンション作成と直列化する。
      await tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(
          eq(notifications.userId, ctx.userId),
          isNull(notifications.readAt),
          inArray(notifications.type, ['mention', 'dm']),
          sql`${notifications.data}->>'channelId' = ${channelId}`,
        ))
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/channels/[channelId]/read]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
