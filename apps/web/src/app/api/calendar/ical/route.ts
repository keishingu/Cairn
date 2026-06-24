// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextRequest, NextResponse } from 'next/server'

function escapeIcal(str: string): string {
  return str
    .replace(/\r\n?/g, '\n')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
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

function foldIcalLine(line: string): string {
  if (line.length <= 75) return line
  const result: string[] = [line.slice(0, 75)]
  let pos = 75
  while (pos < line.length) {
    result.push(' ' + line.slice(pos, pos + 74))
    pos += 74
  }
  return result.join('\r\n')
}

function buildIcal(projects: ProjectRow[], calendarName: string, baseUrl?: string): string {
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

    const vevent: string[] = [
      'BEGIN:VEVENT',
      `UID:project-${p.id}@cairn`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      `DTEND;VALUE=DATE:${dtend}`,
      `SUMMARY:${escapeIcal(p.title)}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    ]
    if (baseUrl) {
      vevent.push(foldIcalLine(`DESCRIPTION:${baseUrl}/projects/${p.id}`))
    }
    vevent.push('END:VEVENT')
    lines.push(...vevent)
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

  try {
    const { db } = await import('@cairn/db')
    const { profiles, projects, projectMembers, workspaceMembers } = await import('@cairn/db')
    const { eq, and, or, isNotNull } = await import('drizzle-orm')

    const [profile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.icalToken, token))

    if (!profile) {
      return new NextResponse('Invalid token', { status: 401 })
    }

    const userId = profile.id

    const [membership] = await db
      .select({ workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId))

    if (!membership) {
      return new NextResponse('No workspace found', { status: 404 })
    }

    let rows: ProjectRow[]

    if (scope === 'workspace') {
      const canReadWorkspaceCalendar = membership.role === 'owner' || membership.role === 'admin'
      if (!canReadWorkspaceCalendar) {
        return new NextResponse('Forbidden', { status: 403 })
      }

      rows = await db
        .select({ id: projects.id, title: projects.title, startDate: projects.startDate, endDate: projects.endDate })
        .from(projects)
        .where(and(eq(projects.workspaceId, membership.workspaceId), eq(projects.archived, false)))
    } else {
      rows = await db
        .selectDistinct({ id: projects.id, title: projects.title, startDate: projects.startDate, endDate: projects.endDate })
        .from(projects)
        .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)))
        .where(and(
          eq(projects.workspaceId, membership.workspaceId),
          eq(projects.archived, false),
          or(eq(projects.createdBy, userId), isNotNull(projectMembers.projectId)),
        ))
    }

    const ical = buildIcal(rows, scope === 'workspace' ? 'Cairn（全体）' : 'Cairn（自分）', req.nextUrl.origin)
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
