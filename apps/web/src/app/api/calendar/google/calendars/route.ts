// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { getGcalAccount, getFreshToken, updateGcalMeta } from '@/lib/google-calendar-account'
import { isGoogleInvalidGrantError, listCalendars } from '@/lib/google-calendar-api'
import type { SelectedCalendar } from '@/lib/google-calendar-account'

export interface GcalCalendarDto {
  id: string
  name: string
  color: string
  primary: boolean
  selected: boolean
}

/** Google カレンダー一覧と選択状態を返す */
export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const account = await getGcalAccount(ctx.userId)
    if (!account) return NextResponse.json({ error: 'Not connected' }, { status: 404 })

    const { accessToken } = await getFreshToken(account)
    const calendars = await listCalendars(accessToken)

    const selectedIds = new Set(account.meta.selectedCalendars.map(c => c.id))
    const result: GcalCalendarDto[] = calendars.map(c => ({
      id: c.id,
      name: c.summary,
      color: c.backgroundColor ?? '#039BE5',
      primary: c.primary ?? false,
      selected: selectedIds.has(c.id),
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/calendar/google/calendars GET]', err)
    if (isGoogleInvalidGrantError(err)) {
      return NextResponse.json(
        { error: 'Google カレンダーの接続が期限切れです。再接続してください。', code: 'GOOGLE_RECONNECT_REQUIRED' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** 選択するカレンダーを更新する */
export async function PUT(req: NextRequest) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const body = await req.json() as { selectedCalendars: SelectedCalendar[] }

  try {
    const account = await getGcalAccount(ctx.userId)
    if (!account) return NextResponse.json({ error: 'Not connected' }, { status: 404 })

    await updateGcalMeta(account.id, { selectedCalendars: body.selectedCalendars })

    // 選択変更後はキャッシュを破棄して次回再取得させる
    const { db, googleCalendarEvents } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')
    await db.delete(googleCalendarEvents).where(eq(googleCalendarEvents.userId, ctx.userId))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/calendar/google/calendars PUT]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
