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

interface MilestoneRow {
  id: string
  projectId: string
  projectTitle: string
  title: string
  description: string | null
  startDate: string | null
  endDate: string | null
  startTime: string | null
  endTime: string | null
}

function foldIcalLine(line: string): string {
  const encoder = new TextEncoder()
  const result: string[] = []
  let current = ''
  let currentBytes = 0

  // RFC 5545 の75オクテット制限に合わせ、コードポイント境界を保ったまま折り返す
  for (const char of line) {
    const charBytes = encoder.encode(char).length
    if (currentBytes + charBytes > 75) {
      result.push(current)
      current = ` ${char}`
      currentBytes = 1 + charBytes
    } else {
      current += char
      currentBytes += charBytes
    }
  }

  result.push(current)
  return result.join('\r\n')
}

function formatUtcDateTime(dateStr: string, timeStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute, second = 0] = timeStr.split(':').map(Number)
  // マイルストーンの時刻は Cairn のカレンダーと同じ Asia/Tokyo として扱う
  return (
    new Date(Date.UTC(year!, month! - 1, day!, hour! - 9, minute!, second))
      .toISOString()
      .replace(/[-:]/g, '')
      .slice(0, 15) + 'Z'
  )
}

function buildIcal(
  projects: ProjectRow[],
  milestones: MilestoneRow[],
  calendarName: string,
  baseUrl?: string,
): string {
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
      foldIcalLine(`SUMMARY:${escapeIcal(p.title)}`),
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    ]
    if (baseUrl) {
      vevent.push(foldIcalLine(`DESCRIPTION:${baseUrl}/projects/${p.id}`))
    }
    vevent.push('END:VEVENT')
    lines.push(...vevent)
  }

  for (const milestone of milestones) {
    if (!milestone.startDate && !milestone.endDate) continue

    const firstDate = milestone.startDate ?? milestone.endDate!
    const lastDate = milestone.endDate ?? milestone.startDate!
    const startDate = firstDate <= lastDate ? firstDate : lastDate
    const endDate = firstDate <= lastDate ? lastDate : firstDate
    const summary = `${milestone.projectTitle} / ${milestone.title}`
    const vevent: string[] = [
      'BEGIN:VEVENT',
      `UID:milestone-${milestone.id}@cairn`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    ]

    if (milestone.startTime || milestone.endTime) {
      const eventStartDate = milestone.startTime ? startDate : endDate
      const eventStartTime = milestone.startTime ?? milestone.endTime!
      const dtstart = formatUtcDateTime(eventStartDate, eventStartTime)
      vevent.push(`DTSTART:${dtstart}`)
      if (milestone.startTime && milestone.endTime) {
        let dtend = formatUtcDateTime(endDate, milestone.endTime)
        if (dtend <= dtstart) {
          const nextEndDate = new Date(`${endDate}T00:00:00Z`)
          nextEndDate.setUTCDate(nextEndDate.getUTCDate() + 1)
          dtend = formatUtcDateTime(nextEndDate.toISOString().slice(0, 10), milestone.endTime)
        }
        vevent.push(`DTEND:${dtend}`)
      }
    } else {
      const exclusiveEnd = new Date(endDate)
      exclusiveEnd.setDate(exclusiveEnd.getDate() + 1)
      vevent.push(`DTSTART;VALUE=DATE:${formatDate(startDate)}`)
      vevent.push(`DTEND;VALUE=DATE:${exclusiveEnd.toISOString().slice(0, 10).replace(/-/g, '')}`)
    }

    vevent.push(foldIcalLine(`SUMMARY:${escapeIcal(summary)}`))
    const description = [
      milestone.description,
      baseUrl ? `${baseUrl}/projects/${milestone.projectId}` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join('\n')
    if (description) {
      vevent.push(foldIcalLine(`DESCRIPTION:${escapeIcal(description)}`))
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
  const workspaceId = searchParams.get('workspaceId')

  if (!token) {
    return new NextResponse('token is required', { status: 400 })
  }
  if (!workspaceId) {
    return new NextResponse('workspaceId is required', { status: 400 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { profiles, projects, projectMembers, activeWorkspaceMembers, milestones } =
      await import('@cairn/db')
    const { eq, and, or, isNotNull } = await import('drizzle-orm')

    const [profile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.icalToken, token))

    if (!profile) {
      return new NextResponse('Invalid token', { status: 401 })
    }

    const userId = profile.id

    // active membership のみ iCal フィードを発行する（非活性メンバーは当該 WS 未所属扱い）
    const [membership] = await db
      .select({
        workspaceId: activeWorkspaceMembers.workspaceId,
        role: activeWorkspaceMembers.role,
      })
      .from(activeWorkspaceMembers)
      .where(
        and(
          eq(activeWorkspaceMembers.userId, userId),
          eq(activeWorkspaceMembers.workspaceId, workspaceId),
        ),
      )

    if (!membership) {
      return new NextResponse('No workspace found', { status: 404 })
    }

    let rows: ProjectRow[]
    let milestoneRows: MilestoneRow[]

    if (scope === 'workspace') {
      const canReadWorkspaceCalendar = membership.role === 'owner' || membership.role === 'admin'
      if (!canReadWorkspaceCalendar) {
        return new NextResponse('Forbidden', { status: 403 })
      }

      rows = await db
        .select({
          id: projects.id,
          title: projects.title,
          startDate: projects.startDate,
          endDate: projects.endDate,
        })
        .from(projects)
        .where(and(eq(projects.workspaceId, membership.workspaceId), eq(projects.archived, false)))
      milestoneRows = await db
        .select({
          id: milestones.id,
          projectId: milestones.projectId,
          projectTitle: projects.title,
          title: milestones.title,
          description: milestones.description,
          startDate: milestones.startDate,
          endDate: milestones.endDate,
          startTime: milestones.startTime,
          endTime: milestones.endTime,
        })
        .from(milestones)
        .innerJoin(projects, eq(milestones.projectId, projects.id))
        .where(and(eq(projects.workspaceId, membership.workspaceId), eq(projects.archived, false)))
    } else {
      rows = await db
        .selectDistinct({
          id: projects.id,
          title: projects.title,
          startDate: projects.startDate,
          endDate: projects.endDate,
        })
        .from(projects)
        .leftJoin(
          projectMembers,
          and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)),
        )
        .where(
          and(
            eq(projects.workspaceId, membership.workspaceId),
            eq(projects.archived, false),
            or(eq(projects.createdBy, userId), isNotNull(projectMembers.projectId)),
          ),
        )
      milestoneRows = await db
        .selectDistinct({
          id: milestones.id,
          projectId: milestones.projectId,
          projectTitle: projects.title,
          title: milestones.title,
          description: milestones.description,
          startDate: milestones.startDate,
          endDate: milestones.endDate,
          startTime: milestones.startTime,
          endTime: milestones.endTime,
        })
        .from(milestones)
        .innerJoin(projects, eq(milestones.projectId, projects.id))
        .leftJoin(
          projectMembers,
          and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)),
        )
        .where(
          and(
            eq(projects.workspaceId, membership.workspaceId),
            eq(projects.archived, false),
            or(eq(projects.createdBy, userId), isNotNull(projectMembers.projectId)),
          ),
        )
    }

    const ical = buildIcal(
      rows,
      milestoneRows,
      scope === 'workspace' ? 'Cairn（全体）' : 'Cairn（自分）',
      req.nextUrl.origin,
    )
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
