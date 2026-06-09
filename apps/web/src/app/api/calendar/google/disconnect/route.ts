// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export async function POST() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, connectedAccounts, googleCalendarEvents } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')

    await db.delete(connectedAccounts)
      .where(and(
        eq(connectedAccounts.userId, ctx.userId),
        eq(connectedAccounts.provider, 'google_calendar'),
      ))

    // キャッシュも削除
    await db.delete(googleCalendarEvents)
      .where(eq(googleCalendarEvents.userId, ctx.userId))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/calendar/google/disconnect]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
