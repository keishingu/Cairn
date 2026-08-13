// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export interface ConversationDto {
  id: string
  title: string | null
  createdAt: string
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, aiConversations } = await import('@cairn/db')
    const { and, eq, desc } = await import('drizzle-orm')

    const rows = await db
      .select({ id: aiConversations.id, title: aiConversations.title, createdAt: aiConversations.createdAt })
      .from(aiConversations)
      .where(
        and(
          eq(aiConversations.workspaceId, ctx.workspaceId),
          eq(aiConversations.createdBy, ctx.userId),
        ),
      )
      .orderBy(desc(aiConversations.createdAt))

    return NextResponse.json(
      rows.map(r => ({
        id: r.id,
        title: r.title,
        createdAt: r.createdAt.toISOString(),
      })) satisfies ConversationDto[],
    )
  } catch (err) {
    console.error('[GET /api/ai/conversations]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, aiConversations } = await import('@cairn/db')

    const [inserted] = await db
      .insert(aiConversations)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
      })
      .returning({ id: aiConversations.id, title: aiConversations.title, createdAt: aiConversations.createdAt })

    if (!inserted) throw new Error('Insert returned no rows')

    return NextResponse.json(
      { id: inserted.id, title: inserted.title, createdAt: inserted.createdAt.toISOString() } satisfies ConversationDto,
      { status: 201 },
    )
  } catch (err) {
    console.error('[POST /api/ai/conversations]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
