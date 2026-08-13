// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { getGcalAccount, getFreshToken, updateGcalMeta } from '@/lib/google-calendar-account'
import { listEvents } from '@/lib/google-calendar-api'

export interface GcalEventDto {
  id: string
  title: string
  startDate: string
  endDate: string
  startTime: string | null
  endTime: string | null
  isAllDay: boolean
  calendarName: string | null
  calendarColor: string | null
  htmlLink: string | null
}

/** カレンダー表示に必要な範囲（6週分）を算出する */
function getCalendarRange(year: number, month: number): { timeMin: Date; timeMax: Date } {
  // 月初の前の日曜日から6週後まで
  const first = new Date(year, month, 1)
  const calStart = new Date(first)
  calStart.setDate(first.getDate() - first.getDay())
  calStart.setHours(0, 0, 0, 0)

  const calEnd = new Date(calStart)
  calEnd.setDate(calStart.getDate() + 42)

  return { timeMin: calStart, timeMax: calEnd }
}

/** 15分以内に同期済みならキャッシュを返す */
const SYNC_TTL_MS = 15 * 60 * 1000

/**
 * Google カレンダーイベントを取得する。
 * キャッシュ（DB）が新鮮な場合はそこから返し、古い場合は Google API から再取得してupsertする。
 *
 * query: year, month (0始まり)
 */
export async function GET(req: NextRequest) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const { searchParams } = req.nextUrl
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()), 10)
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth()), 10)

  if (isNaN(year) || isNaN(month) || month < 0 || month > 11) {
    return NextResponse.json({ error: 'Invalid year/month' }, { status: 400 })
  }

  try {
    const account = await getGcalAccount(ctx.userId)
    if (!account) return NextResponse.json([] satisfies GcalEventDto[])

    const { timeMin, timeMax } = getCalendarRange(year, month)

    const lastSynced = account.meta.lastSyncedAt ? new Date(account.meta.lastSyncedAt) : null
    const needsSync = !lastSynced || Date.now() - lastSynced.getTime() > SYNC_TTL_MS

    if (needsSync) {
      await syncEvents(account, ctx.userId, ctx.workspaceId, timeMin, timeMax)
    }

    const { db, googleCalendarEvents } = await import('@cairn/db')
    const { eq, and, gte, lte, or } = await import('drizzle-orm')

    const startStr = timeMin.toISOString().slice(0, 10)
    const endStr = new Date(timeMax.getTime() - 86400000).toISOString().slice(0, 10)

    const rows = await db
      .select()
      .from(googleCalendarEvents)
      .where(and(
        eq(googleCalendarEvents.userId, ctx.userId),
        or(
          and(gte(googleCalendarEvents.startDate, startStr), lte(googleCalendarEvents.startDate, endStr)),
          and(gte(googleCalendarEvents.endDate, startStr), lte(googleCalendarEvents.endDate, endStr)),
        ),
      ))

    const result: GcalEventDto[] = rows
      .filter(r => r.startDate)
      .map(r => ({
        id: r.id,
        title: r.title,
        startDate: r.startDate!,
        endDate: r.endDate ?? r.startDate!,
        startTime: r.startTime,
        endTime: r.endTime,
        isAllDay: r.isAllDay,
        calendarName: r.calendarName,
        calendarColor: r.calendarColor,
        htmlLink: r.htmlLink,
      }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/calendar/google/events GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function syncEvents(
  account: NonNullable<Awaited<ReturnType<typeof getGcalAccount>>>,
  userId: string,
  workspaceId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<void> {
  const { accessToken, account: refreshedAccount } = await getFreshToken(account)
  const selectedCalendars = refreshedAccount.meta.selectedCalendars

  if (selectedCalendars.length === 0) return

  const { db, googleCalendarEvents } = await import('@cairn/db')

  type InsertRow = typeof googleCalendarEvents.$inferInsert

  const rows: InsertRow[] = []

  for (const cal of selectedCalendars) {
    let events
    try {
      events = await listEvents(accessToken, cal.id, timeMin.toISOString(), timeMax.toISOString())
    } catch {
      // カレンダー単体の失敗は無視して続行
      continue
    }

    for (const ev of events) {
      if (!ev.start.date && !ev.start.dateTime) continue

      const isAllDay = Boolean(ev.start.date)
      let startDate: string | null = null
      let endDate: string | null = null
      let startTime: string | null = null
      let endTime: string | null = null

      if (isAllDay && ev.start.date && ev.end.date) {
        startDate = ev.start.date
        // Google の終了日は exclusive なので 1日戻して inclusive にする
        const d = new Date(ev.end.date)
        d.setDate(d.getDate() - 1)
        endDate = d.toISOString().slice(0, 10)
      } else if (ev.start.dateTime) {
        startDate = ev.start.dateTime.slice(0, 10)
        endDate = ev.end.dateTime ? ev.end.dateTime.slice(0, 10) : startDate
        // dateTime は "YYYY-MM-DDTHH:mm:ss+09:00" 形式。イベントのタイムゾーンでの時刻を HH:mm として保存する
        startTime = ev.start.dateTime.slice(11, 16)
        endTime = ev.end.dateTime ? ev.end.dateTime.slice(11, 16) : startTime
      }

      if (!startDate) continue

      rows.push({
        userId,
        workspaceId,
        googleCalendarId: cal.id,
        googleEventId: ev.id,
        title: ev.summary ?? '（タイトルなし）',
        startDate,
        endDate,
        startTime,
        endTime,
        isAllDay,
        description: ev.description ?? null,
        calendarName: cal.name,
        calendarColor: cal.color,
        htmlLink: ev.htmlLink ?? null,
        syncedAt: new Date(),
      })
    }
  }

  if (rows.length > 0) {
    const { sql } = await import('drizzle-orm')
    await db
      .insert(googleCalendarEvents)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          googleCalendarEvents.userId,
          googleCalendarEvents.googleCalendarId,
          googleCalendarEvents.googleEventId,
        ],
        set: {
          title: sql`excluded.title`,
          startDate: sql`excluded.start_date`,
          endDate: sql`excluded.end_date`,
          startTime: sql`excluded.start_time`,
          endTime: sql`excluded.end_time`,
          syncedAt: sql`excluded.synced_at`,
        },
      })
  }

  await updateGcalMeta(refreshedAccount.id, { lastSyncedAt: new Date().toISOString() })
}
