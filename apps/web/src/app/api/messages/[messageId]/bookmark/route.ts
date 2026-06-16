// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

type RouteContext = { params: Promise<{ messageId: string }> }

// メッセージの個人ブックマークをトグルする
export async function POST(_req: Request, { params }: RouteContext) {
  const { messageId } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  try {
    const { db, messageBookmarks } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')

    const [existing] = await db
      .select({ id: messageBookmarks.id })
      .from(messageBookmarks)
      .where(and(eq(messageBookmarks.messageId, messageId), eq(messageBookmarks.userId, ctx.userId)))

    if (existing) {
      await db.delete(messageBookmarks).where(eq(messageBookmarks.id, existing.id))
      return NextResponse.json({ bookmarked: false })
    }

    await db.insert(messageBookmarks).values({ messageId, userId: ctx.userId })
    return NextResponse.json({ bookmarked: true })
  } catch (err) {
    console.error('[/api/messages/[messageId]/bookmark POST] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
