// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import type { GcalAccountMeta, SelectedCalendar } from '@/lib/google-calendar-account'

export interface GcalStatusDto {
  connected: boolean
  email?: string
  selectedCalendars?: SelectedCalendar[]
  configured: boolean
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const configured = !!(process.env['GOOGLE_CALENDAR_CLIENT_ID'] && process.env['GOOGLE_CALENDAR_REDIRECT_URI'])
  if (!configured) {
    return NextResponse.json({ connected: false, configured: false } satisfies GcalStatusDto)
  }

  try {
    const { db, connectedAccounts } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')

    const [row] = await db
      .select({ providerAccountId: connectedAccounts.providerAccountId, metadata: connectedAccounts.metadata })
      .from(connectedAccounts)
      .where(and(
        eq(connectedAccounts.userId, ctx.userId),
        eq(connectedAccounts.provider, 'google_calendar'),
      ))
      .limit(1)

    if (!row) {
      return NextResponse.json({ connected: false, configured } satisfies GcalStatusDto)
    }

    const meta = row.metadata as unknown as GcalAccountMeta
    return NextResponse.json({
      connected: true,
      configured,
      email: meta.googleAccountEmail ?? row.providerAccountId ?? undefined,
      selectedCalendars: meta.selectedCalendars ?? [],
    } satisfies GcalStatusDto)
  } catch (err) {
    console.error('[/api/calendar/google/status]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
