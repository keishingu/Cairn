// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextRequest, NextResponse } from 'next/server'
import { PROJECTS } from '@/components/app/data'

const DEV_TOKEN = 'dev-ical-token-00000000000000000000000000000001'

function escapeIcal(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function formatDate(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

interface ProjectRow {
  id: string
  title: string
  startDate: string | null
  endDate: string | null
}

function buildIcal(projects: ProjectRow[], calendarName: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cairn//Cairn Calendar//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcal(calendarName)}`,
    'X-WR-TIMEZONE:Asia/Tokyo',
  ]

  for (const p of projects) {
    if (!p.startDate) continue

    const dtstart = formatDate(p.startDate)
    // iCal の DTEND は exclusive なので終了日の翌日を指定する
    const endDateStr = p.endDate ?? p.startDate
    const endDate = new Date(endDateStr)
    endDate.setDate(endDate.getDate() + 1)
    const dtend = endDate.toISOString().slice(0, 10).replace(/-/g, '')

    lines.push(
      'BEGIN:VEVENT',
      `UID:project-${p.id}@cairn`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      `DTEND;VALUE=DATE:${dtend}`,
      `SUMMARY:${escapeIcal(p.title)}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const token = searchParams.get('token')
  const scope = searchParams.get('scope') ?? 'me'

  if (!token) {
    return new NextResponse('token is required', { status: 400 })
  }

  if (!process.env['DATABASE_URL']) {
    if (token !== DEV_TOKEN) {
      return new NextResponse('Invalid token', { status: 401 })
    }
    const projects: ProjectRow[] = PROJECTS.map(p => ({
      id: p.id,
      title: p.name,
      startDate: p.startDate,
      endDate: p.endDate,
    }))
    const ical = buildIcal(projects, scope === 'workspace' ? 'Cairn（全体）' : 'Cairn（自分）')
    return new NextResponse(ical, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="cairn.ics"',
        'Cache-Control': 'no-cache',
      },
    })
  }

  try {
    const { db } = await import('@cairn/db')
    const { profiles, projects, projectMembers, workspaceMembers } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    const [profile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.icalToken, token))

    if (!profile) {
      return new NextResponse('Invalid token', { status: 401 })
    }

    const userId = profile.id

    const [membership] = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId))

    if (!membership) {
      return new NextResponse('No workspace found', { status: 404 })
    }

    let rows: ProjectRow[]

    if (scope === 'workspace') {
      rows = await db
        .select({ id: projects.id, title: projects.title, startDate: projects.startDate, endDate: projects.endDate })
        .from(projects)
        .where(and(eq(projects.workspaceId, membership.workspaceId), eq(projects.archived, false)))
    } else {
      rows = await db
        .select({ id: projects.id, title: projects.title, startDate: projects.startDate, endDate: projects.endDate })
        .from(projects)
        .innerJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)))
        .where(and(eq(projects.workspaceId, membership.workspaceId), eq(projects.archived, false)))
    }

    const ical = buildIcal(rows, scope === 'workspace' ? 'Cairn（全体）' : 'Cairn（自分）')
    return new NextResponse(ical, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="cairn.ics"',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err) {
    console.error('[/api/calendar/ical GET]', err)
    return new NextResponse('Internal server error', { status: 500 })
  }
}
