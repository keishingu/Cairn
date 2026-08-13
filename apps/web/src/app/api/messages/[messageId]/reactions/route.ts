// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
import { runForActiveMembership } from '@/lib/access/active-membership-lock'

const toggleSchema = z.object({
  emoji: z.string().min(1).max(10),
})

type RouteContext = { params: Promise<{ messageId: string }> }

export async function POST(req: Request, { params }: RouteContext) {
  const { messageId } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = toggleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { emoji } = parsed.data

  try {
    const { db } = await import('@cairn/db')
    const { messageReactions, messages } = await import('@cairn/db')
    const { and, eq, count, isNull } = await import('drizzle-orm')

    // メッセージが属するチャンネルへのアクセス権を検証（越境リアクション・private/DM/ゲスト制限の回避を防ぐ）
    const [target] = await db
      .select({ channelId: messages.channelId })
      .from(messages)
      .where(and(eq(messages.id, messageId), isNull(messages.deletedAt)))
      .limit(1)

    if (!target) {
      return NextResponse.json({ error: 'メッセージが見つかりません' }, { status: 404 })
    }

    const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, target.channelId, ctx.role)
    if (forbidden) return forbidden

    const result = await runForActiveMembership(
      db,
      ctx.workspaceId,
      ctx.userId,
      async (tx) => {
        const [existing] = await tx
          .select({ id: messageReactions.id })
          .from(messageReactions)
          .where(
            and(
              eq(messageReactions.messageId, messageId),
              eq(messageReactions.userId, ctx.userId),
              eq(messageReactions.emoji, emoji),
            ),
          )

        if (existing) {
          await tx.delete(messageReactions).where(eq(messageReactions.id, existing.id))
        } else {
          await tx.insert(messageReactions).values({ messageId, userId: ctx.userId, emoji })
        }

        const countResult = await tx
          .select({ n: count() })
          .from(messageReactions)
          .where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.emoji, emoji)))

        return { added: !existing, count: Number(countResult[0]?.n ?? 0) }
      },
    )

    if (!result) {
      return NextResponse.json({ error: 'ワークスペースに所属していません' }, { status: 403 })
    }

    return NextResponse.json({ added: result.added, emoji, count: result.count })
  } catch (err) {
    console.error('[/api/messages/[messageId]/reactions POST] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
