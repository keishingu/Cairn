// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'

const toggleSchema = z.object({
  emoji: z.string().min(1).max(10),
})

// Placeholder user until auth is wired up
const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'

type RouteContext = { params: Promise<{ messageId: string }> }

export async function POST(req: Request, { params }: RouteContext) {
  const { messageId } = await params

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

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json({ added: true, emoji })
  }

  try {
    const { db } = await import('@cairn/db')
    const { messageReactions } = await import('@cairn/db')
    const { and, eq, count } = await import('drizzle-orm')

    const [existing] = await db
      .select({ id: messageReactions.id })
      .from(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, DEV_USER_ID),
          eq(messageReactions.emoji, emoji),
        ),
      )

    if (existing) {
      await db.delete(messageReactions).where(eq(messageReactions.id, existing.id))
    } else {
      await db.insert(messageReactions).values({ messageId, userId: DEV_USER_ID, emoji })
    }

    const countResult = await db
      .select({ n: count() })
      .from(messageReactions)
      .where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.emoji, emoji)))

    return NextResponse.json({ added: !existing, emoji, count: Number(countResult[0]?.n ?? 0) })
  } catch (err) {
    console.error('[/api/messages/[messageId]/reactions POST] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
