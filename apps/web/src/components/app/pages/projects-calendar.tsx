'use client'

import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon, StatusChip } from '../primitives'
import { PageToolbar, SegmentedControl } from './page-toolbar'
import { CreateProjectModal, FilterPopover } from './project-list'
import { useProjectLabel } from '@/lib/use-workspace-settings'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import type { ProjectDto } from '@/app/api/projects/route'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'
import type { GcalEventDto } from '@/app/api/calendar/google/events/route'
import type { GcalStatusDto } from '@/app/api/calendar/google/status/route'
import { MobileHeader } from '@/components/app/mobile/header'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

// ─── Date helpers ──────────────────────────────────────────────────

function getCalendarStart(year: number, month: number): Date {
  const d = new Date(year, month, 1)
  d.setDate(d.getDate() - d.getDay()) // back to Sunday
  return d
}

function daysBetween(a: Date, b: Date): number {
  const aUTC = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const bUTC = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((bUTC - aUTC) / 86400000)
}

function formatYM(year: number, month: number): string {
  return `${year}年${month + 1}月`
}

function parseLocalDate(s: string): Date {
  const p = s.split('-')
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
}

function getWeekStart(d: Date): Date {
  const result = new Date(d)
  result.setDate(d.getDate() - d.getDay())
  result.setHours(0, 0, 0, 0)
  return result
}

function formatWeekRange(start: Date): string {
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const m1 = start.getMonth() + 1
  const m2 = end.getMonth() + 1
  if (m1 === m2) return `${m1}月${start.getDate()}日–${end.getDate()}日`
  return `${m1}/${start.getDate()}–${m2}/${end.getDate()}`
}

// ─── Calendar cell data ────────────────────────────────────────────

interface CalCell {
  date: number
  fullDate: Date
  isOther: boolean
  isToday: boolean
}

function buildCells(year: number, month: number): CalCell[][] {
  const today = new Date()
  const calStart = getCalendarStart(year, month)
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const d = new Date(calStart)
      d.setDate(d.getDate() + week * 7 + day)
      return {
        date: d.getDate(),
        fullDate: new Date(d),
        isOther: d.getMonth() !== month,
        isToday: d.toDateString() === today.toDateString(),
      }
    }),
  )
}

// ─── Calendar event data ───────────────────────────────────────────

interface CalEvent {
  project: ProjectDto
  week: number
  day: number
  span: number
  row: number
}

interface GcalDisplayEvent {
  id: string
  title: string
  color: string
  htmlLink: string | null
  week: number
  day: number
  span: number
  row: number
}

export function buildGcalEvents(events: GcalEventDto[], year: number, month: number): GcalDisplayEvent[] {
  const calStart = getCalendarStart(year, month)
  const calEnd = new Date(calStart)
  calEnd.setDate(calEnd.getDate() + 41)

  const raw: Omit<GcalDisplayEvent, 'row'>[] = []

  for (const ev of events) {
    const start = parseLocalDate(ev.startDate)
    const end = parseLocalDate(ev.endDate)

    if (end < calStart || start > calEnd) continue

    const visStart = start < calStart ? new Date(calStart) : start
    const visEnd = end > calEnd ? new Date(calEnd) : end

    let cur = new Date(visStart)
    while (cur <= visEnd) {
      const week = Math.floor(daysBetween(calStart, cur) / 7)
      const day = cur.getDay()
      const weekEnd = new Date(cur)
      weekEnd.setDate(weekEnd.getDate() + (6 - day))
      const segEnd = weekEnd < visEnd ? weekEnd : visEnd
      const span = daysBetween(cur, segEnd) + 1
      raw.push({ id: ev.id, title: ev.title, color: ev.calendarColor ?? '#4285F4', htmlLink: ev.htmlLink, week, day, span })
      cur = new Date(segEnd)
      cur.setDate(cur.getDate() + 1)
    }
  }

  const result: GcalDisplayEvent[] = []
  for (let w = 0; w < 6; w++) {
    const weekEvents = raw.filter(e => e.week === w).sort((a, b) => a.day - b.day)
    const occupiedUntil: number[] = []
    for (const e of weekEvents) {
      let row = 0
      while ((occupiedUntil[row] ?? -1) >= e.day) row++
      occupiedUntil[row] = e.day + e.span - 1
      result.push({ ...e, row })
    }
  }
  return result
}

function buildEvents(projects: ProjectDto[], year: number, month: number): CalEvent[] {
  const calStart = getCalendarStart(year, month)
  const calEnd = new Date(calStart)
  calEnd.setDate(calEnd.getDate() + 41)

  const raw: Omit<CalEvent, 'row'>[] = []

  for (const project of projects) {
    if (!project.startDate) continue

    const start = parseLocalDate(project.startDate)
    const end = project.endDate ? parseLocalDate(project.endDate) : new Date(start)

    if (end < calStart || start > calEnd) continue

    const visStart = start < calStart ? new Date(calStart) : start
    const visEnd = end > calEnd ? new Date(calEnd) : end

    let cur = new Date(visStart)
    while (cur <= visEnd) {
      const week = Math.floor(daysBetween(calStart, cur) / 7)
      const day = cur.getDay()
      const weekEnd = new Date(cur)
      weekEnd.setDate(weekEnd.getDate() + (6 - day))
      const segEnd = weekEnd < visEnd ? weekEnd : visEnd
      const span = daysBetween(cur, segEnd) + 1
      raw.push({ project, week, day, span })
      cur = new Date(segEnd)
      cur.setDate(cur.getDate() + 1)
    }
  }

  const result: CalEvent[] = []
  for (let w = 0; w < 6; w++) {
    const weekEvents = raw.filter(e => e.week === w).sort((a, b) => a.day - b.day)
    const occupiedUntil: number[] = []
    for (const e of weekEvents) {
      let row = 0
      while ((occupiedUntil[row] ?? -1) >= e.day) row++
      occupiedUntil[row] = e.day + e.span - 1
      result.push({ ...e, row })
    }
  }
  return result
}

function buildWeekEvents(projects: ProjectDto[], weekStart: Date): CalEvent[] {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)

  const raw: Omit<CalEvent, 'row'>[] = []

  for (const project of projects) {
    if (!project.startDate) continue

    const start = parseLocalDate(project.startDate)
    const end = project.endDate ? parseLocalDate(project.endDate) : new Date(start)

    if (end < weekStart || start > weekEnd) continue

    const visStart = start < weekStart ? new Date(weekStart) : start
    const visEnd = end > weekEnd ? new Date(weekEnd) : end
    const day = daysBetween(weekStart, visStart)
    const span = daysBetween(visStart, visEnd) + 1
    raw.push({ project, week: 0, day, span })
  }

  const result: CalEvent[] = []
  const sorted = raw.sort((a, b) => a.day - b.day)
  const occupiedUntil: number[] = []
  for (const e of sorted) {
    let row = 0
    while ((occupiedUntil[row] ?? -1) >= e.day) row++
    occupiedUntil[row] = e.day + e.span - 1
    result.push({ ...e, row })
  }
  return result
}

export function buildGcalWeekEvents(events: GcalEventDto[], weekStart: Date): GcalDisplayEvent[] {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)

  const raw: Omit<GcalDisplayEvent, 'row'>[] = []

  for (const ev of events) {
    const start = parseLocalDate(ev.startDate)
    const end = parseLocalDate(ev.endDate)

    if (end < weekStart || start > weekEnd) continue

    const visStart = start < weekStart ? new Date(weekStart) : start
    const visEnd = end > weekEnd ? new Date(weekEnd) : end
    const day = daysBetween(weekStart, visStart)
    const span = daysBetween(visStart, visEnd) + 1
    raw.push({ id: ev.id, title: ev.title, color: ev.calendarColor ?? '#4285F4', htmlLink: ev.htmlLink, week: 0, day, span })
  }

  const result: GcalDisplayEvent[] = []
  const sorted = raw.sort((a, b) => a.day - b.day)
  const occupiedUntil: number[] = []
  for (const e of sorted) {
    let row = 0
    while ((occupiedUntil[row] ?? -1) >= e.day) row++
    occupiedUntil[row] = e.day + e.span - 1
    result.push({ ...e, row })
  }
  return result
}

interface GcalTimedEvent {
  id: string
  title: string
  color: string
  htmlLink: string | null
  day: number
  startMin: number
  endMin: number
  col: number
  cols: number
}

const MIN_TIMED_EVENT_MINUTES = 30

/** 時刻指定のGoogleカレンダーイベントを、週グリッド上の位置（曜日・分・列）に変換する */
export function buildGcalTimedEvents(events: GcalEventDto[], weekStart: Date): GcalTimedEvent[] {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)

  const raw: Omit<GcalTimedEvent, 'col' | 'cols'>[] = []

  for (const ev of events) {
    if (ev.isAllDay || !ev.startTime) continue
    const start = parseLocalDate(ev.startDate)
    if (start < weekStart || start > weekEnd) continue

    const day = daysBetween(weekStart, start)
    const [sh, sm] = ev.startTime.split(':').map(Number)
    const startMin = (sh ?? 0) * 60 + (sm ?? 0)

    let endMin = startMin + MIN_TIMED_EVENT_MINUTES
    if (ev.endTime) {
      if (ev.endDate !== ev.startDate) {
        endMin = 24 * 60
      } else {
        const [eh, em] = ev.endTime.split(':').map(Number)
        endMin = (eh ?? 0) * 60 + (em ?? 0)
        if (endMin <= startMin) endMin = startMin + MIN_TIMED_EVENT_MINUTES
      }
    }

    raw.push({ id: ev.id, title: ev.title, color: ev.calendarColor ?? '#4285F4', htmlLink: ev.htmlLink, day, startMin, endMin })
  }

  const result: GcalTimedEvent[] = []
  for (let d = 0; d < 7; d++) {
    const dayEvents = raw.filter(e => e.day === d).sort((a, b) => a.startMin - b.startMin)
    const colEndMin: number[] = []
    const assigned = dayEvents.map(e => {
      let col = 0
      while ((colEndMin[col] ?? -1) > e.startMin) col++
      colEndMin[col] = e.endMin
      return { ...e, col }
    })
    const cols = colEndMin.length
    for (const e of assigned) result.push({ ...e, cols })
  }
  return result
}

function getDateProjects(projects: ProjectDto[], d: Date): ProjectDto[] {
  const ms = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return projects.filter(p => {
    if (!p.startDate) return false
    const start = parseLocalDate(p.startDate)
    const end = p.endDate ? parseLocalDate(p.endDate) : start
    const sMs = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
    const eMs = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
    return ms >= sMs && ms <= eMs
  })
}

// ─── PC Calendar grid ──────────────────────────────────────────────

const DATE_AREA = 28
const EVENT_H = 22
const EVENT_GAP = 2
const MAX_ROWS = 3

interface CalendarGridProps {
  year: number
  month: number
  events: CalEvent[]
  gcalEvents?: GcalDisplayEvent[]
  onEventClick: (project: ProjectDto) => void
  onDateSelect: (start: string, end: string) => void
  isLoading: boolean
}

function formatISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface GcalCalendarPopoverProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  calendars: { name: string; color: string }[]
  hidden: string[]
  onChange: (hidden: string[]) => void
  onClose: () => void
}

const GcalCalendarPopover = ({ containerRef, calendars, hidden, onChange, onClose }: GcalCalendarPopoverProps) => {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        containerRef.current && !containerRef.current.contains(e.target as Node)
      ) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [containerRef, onClose])

  const toggle = (name: string) =>
    onChange(hidden.includes(name) ? hidden.filter(x => x !== name) : [...hidden, name])

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', right: 0, marginTop: 4,
      width: 220, background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 200, padding: 12,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        表示するカレンダー
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {calendars.map(c => (
          <label
            key={c.name}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--card-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <input
              type="checkbox"
              checked={!hidden.includes(c.name)}
              onChange={() => toggle(c.name)}
              style={{ width: 14, height: 14, accentColor: c.color, cursor: 'pointer' }}
            />
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

const CalendarGrid = ({ year, month, events, gcalEvents = [], onEventClick, onDateSelect, isLoading }: CalendarGridProps) => {
  const days = ['日', '月', '火', '水', '木', '金', '土']
  const cells = buildCells(year, month)
  const flatCells = cells.flat()

  const gridBodyRef = React.useRef<HTMLDivElement>(null)
  const isDragging = React.useRef(false)
  const [dragStart, setDragStart] = React.useState<string | null>(null)
  const [dragEnd, setDragEnd] = React.useState<string | null>(null)

  const getCellDateFromPoint = (clientX: number, clientY: number): string | null => {
    const el = gridBodyRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const col = Math.floor(x / (rect.width / 7))
    const row = Math.floor(y / (rect.height / 6))
    if (col < 0 || col > 6 || row < 0 || row > 5) return null
    const cell = flatCells[row * 7 + col]
    return cell ? formatISO(cell.fullDate) : null
  }

  const getRangeEdges = (a: string | null, b: string | null): [string, string] | null => {
    if (!a || !b) return null
    return a <= b ? [a, b] : [b, a]
  }

  const inDragRange = (date: string): boolean => {
    const edges = getRangeEdges(dragStart, dragEnd)
    if (!edges) return false
    return date >= edges[0] && date <= edges[1]
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    const date = getCellDateFromPoint(e.clientX, e.clientY)
    if (!date) return
    e.preventDefault()
    isDragging.current = true
    setDragStart(date)
    setDragEnd(date)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return
    const date = getCellDateFromPoint(e.clientX, e.clientY)
    if (date) setDragEnd(date)
  }

  const finalizeDrag = (clientX: number, clientY: number) => {
    if (!isDragging.current) return
    isDragging.current = false
    const endDate = getCellDateFromPoint(clientX, clientY) ?? dragEnd
    const edges = getRangeEdges(dragStart, endDate)
    setDragStart(null)
    setDragEnd(null)
    if (edges) onDateSelect(edges[0], edges[1])
  }

  const handleMouseUp = (e: React.MouseEvent) => finalizeDrag(e.clientX, e.clientY)

  React.useEffect(() => {
    const onWindowMouseUp = (e: MouseEvent) => {
      if (isDragging.current) finalizeDrag(e.clientX, e.clientY)
    }
    window.addEventListener('mouseup', onWindowMouseUp)
    return () => window.removeEventListener('mouseup', onWindowMouseUp)
  }, [dragStart, dragEnd]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {days.map((d, i) => (
          <div key={d} style={{
            padding: '8px 12px', fontSize: 11, fontWeight: 600,
            color: i === 0 ? 'var(--red)' : i === 6 ? 'var(--blue)' : 'var(--text-3)',
            textAlign: 'left', letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>{d}</div>
        ))}
      </div>

      <div
        ref={gridBodyRef}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: isDragging.current ? 'crosshair' : 'default', userSelect: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: 'repeat(6, 1fr)', height: '100%' }}>
          {flatCells.map((cell, i) => {
            const week = Math.floor(i / 7)
            const day = i % 7
            const dateStr = formatISO(cell.fullDate)
            const highlighted = inDragRange(dateStr)
            return (
              <div key={i} style={{
                borderRight: day < 6 ? '1px solid var(--border)' : 'none',
                borderBottom: week < 5 ? '1px solid var(--border)' : 'none',
                padding: 6,
                background: highlighted
                  ? 'var(--accent-soft)'
                  : cell.isToday
                    ? 'var(--accent-soft)'
                    : 'transparent',
                transition: 'background .05s',
              }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12.5, fontWeight: cell.isToday ? 700 : 500,
                  width: cell.isToday ? 24 : 'auto', height: cell.isToday ? 24 : 'auto',
                  borderRadius: cell.isToday ? '50%' : 0,
                  background: cell.isToday ? 'var(--accent)' : 'transparent',
                  color: cell.isToday
                    ? 'var(--on-accent)'
                    : cell.isOther
                      ? 'var(--text-4)'
                      : day === 0
                        ? 'var(--red)'
                        : day === 6
                          ? 'var(--blue)'
                          : 'var(--text-2)',
                }}>{cell.date}</span>
              </div>
            )
          })}
        </div>

        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: `calc(${((i * 2) % 7 / 7) * 100}% + 4px)`,
                top: `calc(${Math.floor(i / 3)} / 6 * 100% + ${DATE_AREA}px)`,
                width: `calc(${(2 / 7) * 100}% - 8px)`,
                height: EVENT_H, borderRadius: 5,
                background: 'var(--card-2)', animation: 'pulse 1.5s infinite',
              }} />
            ))
          ) : (
            <>
              {events.filter(e => e.row < MAX_ROWS).map((e, i) => {
                const barColor = e.project.statusColor ?? '#9CA3AF'
                const cfg = { bg: barColor + '18', bar: barColor, text: barColor }
                const colW = 100 / 7
                const left = `calc(${e.day * colW}% + 4px)`
                const width = `calc(${e.span * colW}% - 8px)`
                const topOffset = DATE_AREA + e.row * (EVENT_H + EVENT_GAP)
                const top = `calc(${e.week} / 6 * 100% + ${topOffset}px)`
                return (
                  <button
                    key={`c-${i}`}
                    onClick={() => onEventClick(e.project)}
                    style={{
                      position: 'absolute', left, top, width,
                      height: EVENT_H, borderRadius: 5,
                      background: cfg.bg, color: cfg.text,
                      border: 'none', borderLeft: `3px solid ${cfg.bar}`,
                      fontSize: 11, fontWeight: 600,
                      padding: '0 7px', textAlign: 'left',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontFamily: 'inherit', pointerEvents: 'auto', cursor: 'pointer',
                      transition: 'filter .1s',
                    }}
                    onMouseDown={e2 => e2.stopPropagation()}
                    onMouseEnter={e2 => { (e2.currentTarget as HTMLElement).style.filter = 'brightness(0.95)' }}
                    onMouseLeave={e2 => { (e2.currentTarget as HTMLElement).style.filter = 'none' }}
                    title={e.project.title}
                  >
                    {e.project.title}
                  </button>
                )
              })}
              {gcalEvents.filter(e => e.row < MAX_ROWS).map((e, i) => {
                const colW = 100 / 7
                const left = `calc(${e.day * colW}% + 4px)`
                const width = `calc(${e.span * colW}% - 8px)`
                const topOffset = DATE_AREA + e.row * (EVENT_H + EVENT_GAP)
                const top = `calc(${e.week} / 6 * 100% + ${topOffset}px)`
                const el = (
                  <div
                    key={`g-${i}`}
                    style={{
                      position: 'absolute', left, top, width,
                      height: EVENT_H, borderRadius: 5,
                      background: e.color + '15', color: e.color,
                      borderLeft: `3px dashed ${e.color}`,
                      fontSize: 11, fontWeight: 500,
                      padding: '0 7px',
                      display: 'flex', alignItems: 'center',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      opacity: 0.85,
                    }}
                    title={e.title}
                  >
                    {e.title}
                  </div>
                )
                if (e.htmlLink) {
                  return (
                    <a
                      key={`g-${i}`}
                      href={e.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        position: 'absolute', left, top, width,
                        height: EVENT_H, borderRadius: 5,
                        background: e.color + '15', color: e.color,
                        borderLeft: `3px dashed ${e.color}`,
                        fontSize: 11, fontWeight: 500,
                        padding: '0 7px',
                        display: 'flex', alignItems: 'center',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        opacity: 0.85,
                        textDecoration: 'none',
                        pointerEvents: 'auto',
                        cursor: 'pointer',
                      }}
                      title={`${e.title}（Google カレンダーで開く）`}
                      onMouseDown={e2 => e2.stopPropagation()}
                    >
                      {e.title}
                    </a>
                  )
                }
                return el
              })}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── PC Week grid ────────────────────────────────────────────────

const HOUR_HEIGHT = 48
const GUTTER_W = 48

interface CalendarWeekGridProps {
  weekStart: Date
  events: CalEvent[]
  gcalEvents?: GcalDisplayEvent[]
  timedEvents?: GcalTimedEvent[]
  onEventClick: (project: ProjectDto) => void
  onDateSelect: (start: string, end: string) => void
  isLoading: boolean
}

const CalendarWeekGrid = ({ weekStart, events, gcalEvents = [], timedEvents = [], onEventClick, onDateSelect, isLoading }: CalendarWeekGridProps) => {
  const days = ['日', '月', '火', '水', '木', '金', '土']
  const today = new Date()
  const cells = Array.from({ length: 7 }, (_, day) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + day)
    return { date: d.getDate(), fullDate: d, isToday: d.toDateString() === today.toDateString() }
  })

  const gridBodyRef = React.useRef<HTMLDivElement>(null)
  const isDragging = React.useRef(false)
  const [dragStart, setDragStart] = React.useState<string | null>(null)
  const [dragEnd, setDragEnd] = React.useState<string | null>(null)

  const getCellDateFromPoint = (clientX: number): string | null => {
    const el = gridBodyRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left
    const col = Math.floor(x / (rect.width / 7))
    if (col < 0 || col > 6) return null
    return formatISO(cells[col]!.fullDate)
  }

  const getRangeEdges = (a: string | null, b: string | null): [string, string] | null => {
    if (!a || !b) return null
    return a <= b ? [a, b] : [b, a]
  }

  const inDragRange = (date: string): boolean => {
    const edges = getRangeEdges(dragStart, dragEnd)
    if (!edges) return false
    return date >= edges[0] && date <= edges[1]
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    const date = getCellDateFromPoint(e.clientX)
    if (!date) return
    e.preventDefault()
    isDragging.current = true
    setDragStart(date)
    setDragEnd(date)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return
    const date = getCellDateFromPoint(e.clientX)
    if (date) setDragEnd(date)
  }

  const finalizeDrag = (clientX: number) => {
    if (!isDragging.current) return
    isDragging.current = false
    const endDate = getCellDateFromPoint(clientX) ?? dragEnd
    const edges = getRangeEdges(dragStart, endDate)
    setDragStart(null)
    setDragEnd(null)
    if (edges) onDateSelect(edges[0], edges[1])
  }

  const handleMouseUp = (e: React.MouseEvent) => finalizeDrag(e.clientX)

  React.useEffect(() => {
    const onWindowMouseUp = (e: MouseEvent) => {
      if (isDragging.current) finalizeDrag(e.clientX)
    }
    window.addEventListener('mouseup', onWindowMouseUp)
    return () => window.removeEventListener('mouseup', onWindowMouseUp)
  }, [dragStart, dragEnd]) // eslint-disable-line react-hooks/exhaustive-deps

  const maxRow = Math.max(0, ...events.map(e => e.row), ...gcalEvents.map(e => e.row))
  const bodyHeight = DATE_AREA + (maxRow + 1) * (EVENT_H + EVENT_GAP) + EVENT_GAP

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* 曜日ヘッダー */}
      <div style={{ display: 'grid', gridTemplateColumns: `${GUTTER_W}px repeat(7, 1fr)`, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div />
        {cells.map((cell, i) => (
          <div key={i} style={{
            padding: '8px 12px', fontSize: 11, fontWeight: 600,
            color: i === 0 ? 'var(--red)' : i === 6 ? 'var(--blue)' : 'var(--text-3)',
            textAlign: 'left', letterSpacing: '0.04em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {days[i]}
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12.5, fontWeight: cell.isToday ? 700 : 500,
              width: 22, height: 22, borderRadius: '50%',
              background: cell.isToday ? 'var(--accent)' : 'transparent',
              color: cell.isToday ? 'var(--on-accent)' : 'var(--text-2)',
            }}>{cell.date}</span>
          </div>
        ))}
      </div>

      {/* 終日エリア（Cairnプロジェクト・終日Googleイベント） */}
      <div style={{ display: 'grid', gridTemplateColumns: `${GUTTER_W}px repeat(7, 1fr)`, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'center', paddingTop: 6 }}>終日</div>
        <div
          ref={gridBodyRef}
          style={{ gridColumn: '2 / -1', position: 'relative', minHeight: Math.max(bodyHeight, 32), cursor: isDragging.current ? 'crosshair' : 'default', userSelect: 'none' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', position: 'absolute', inset: 0 }}>
            {cells.map((cell, i) => {
              const dateStr = formatISO(cell.fullDate)
              const highlighted = inDragRange(dateStr)
              return (
                <div key={i} style={{
                  borderRight: i < 6 ? '1px solid var(--border)' : 'none',
                  background: highlighted || cell.isToday ? 'var(--accent-soft)' : 'transparent',
                  transition: 'background .05s',
                }} />
              )
            })}
          </div>

          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{
                  position: 'absolute',
                  left: `calc(${(i % 7) / 7 * 100}% + 4px)`,
                  top: DATE_AREA + i * (EVENT_H + EVENT_GAP),
                  width: `calc(${(2 / 7) * 100}% - 8px)`,
                  height: EVENT_H, borderRadius: 5,
                  background: 'var(--card-2)', animation: 'pulse 1.5s infinite',
                }} />
              ))
            ) : (
              <>
                {events.map((e, i) => {
                  const barColor = e.project.statusColor ?? '#9CA3AF'
                  const cfg = { bg: barColor + '18', bar: barColor, text: barColor }
                  const colW = 100 / 7
                  const left = `calc(${e.day * colW}% + 4px)`
                  const width = `calc(${e.span * colW}% - 8px)`
                  const top = DATE_AREA + e.row * (EVENT_H + EVENT_GAP)
                  return (
                    <button
                      key={`c-${i}`}
                      onClick={() => onEventClick(e.project)}
                      style={{
                        position: 'absolute', left, top, width,
                        height: EVENT_H, borderRadius: 5,
                        background: cfg.bg, color: cfg.text,
                        border: 'none', borderLeft: `3px solid ${cfg.bar}`,
                        fontSize: 11, fontWeight: 600,
                        padding: '0 7px', textAlign: 'left',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontFamily: 'inherit', pointerEvents: 'auto', cursor: 'pointer',
                        transition: 'filter .1s',
                      }}
                      onMouseDown={e2 => e2.stopPropagation()}
                      onMouseEnter={e2 => { (e2.currentTarget as HTMLElement).style.filter = 'brightness(0.95)' }}
                      onMouseLeave={e2 => { (e2.currentTarget as HTMLElement).style.filter = 'none' }}
                      title={e.project.title}
                    >
                      {e.project.title}
                    </button>
                  )
                })}
                {gcalEvents.map((e, i) => {
                  const colW = 100 / 7
                  const left = `calc(${e.day * colW}% + 4px)`
                  const width = `calc(${e.span * colW}% - 8px)`
                  const top = DATE_AREA + e.row * (EVENT_H + EVENT_GAP)
                  const style: React.CSSProperties = {
                    position: 'absolute', left, top, width,
                    height: EVENT_H, borderRadius: 5,
                    background: e.color + '15', color: e.color,
                    borderLeft: `3px dashed ${e.color}`,
                    fontSize: 11, fontWeight: 500,
                    padding: '0 7px',
                    display: 'flex', alignItems: 'center',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    opacity: 0.85,
                  }
                  if (e.htmlLink) {
                    return (
                      <a
                        key={`g-${i}`}
                        href={e.htmlLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...style, textDecoration: 'none', pointerEvents: 'auto', cursor: 'pointer' }}
                        title={`${e.title}（Google カレンダーで開く）`}
                        onMouseDown={e2 => e2.stopPropagation()}
                      >
                        {e.title}
                      </a>
                    )
                  }
                  return <div key={`g-${i}`} style={style} title={e.title}>{e.title}</div>
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 時間グリッド（Googleカレンダーの時刻指定イベント） */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `${GUTTER_W}px 1fr`, height: 24 * HOUR_HEIGHT }}>
          <div style={{ position: 'relative' }}>
            {Array.from({ length: 24 }).map((_, h) => (
              <div key={h} style={{
                position: 'absolute', top: h * HOUR_HEIGHT - 6, right: 8,
                fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap',
              }}>
                {h}:00
              </div>
            ))}
          </div>

          <div style={{ position: 'relative' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', height: '100%' }}>
              {cells.map((cell, i) => (
                <div key={i} style={{
                  position: 'relative',
                  borderRight: i < 6 ? '1px solid var(--border)' : 'none',
                  background: cell.isToday ? 'var(--accent-soft)' : 'transparent',
                }}>
                  {Array.from({ length: 24 }).map((_, h) => (
                    <div key={h} style={{
                      position: 'absolute', top: h * HOUR_HEIGHT, left: 0, right: 0,
                      borderTop: '1px solid var(--border)',
                    }} />
                  ))}
                </div>
              ))}
            </div>

            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {timedEvents.map((e, i) => {
                const colW = 100 / 7
                const segW = colW / e.cols
                const left = `calc(${e.day * colW + e.col * segW}% + 2px)`
                const width = `calc(${segW}% - 4px)`
                const top = (e.startMin / 60) * HOUR_HEIGHT
                const height = Math.max(((e.endMin - e.startMin) / 60) * HOUR_HEIGHT, 16)
                const style: React.CSSProperties = {
                  position: 'absolute', left, top, width, height,
                  borderRadius: 4,
                  background: e.color + '20', color: e.color,
                  borderLeft: `3px dashed ${e.color}`,
                  fontSize: 10.5, fontWeight: 500, lineHeight: 1.3,
                  padding: '2px 5px',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  opacity: 0.9,
                }
                if (e.htmlLink) {
                  return (
                    <a
                      key={`t-${i}`}
                      href={e.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ ...style, textDecoration: 'none', pointerEvents: 'auto', cursor: 'pointer', display: 'block' }}
                      title={`${e.title}（Google カレンダーで開く）`}
                    >
                      {e.title}
                    </a>
                  )
                }
                return <div key={`t-${i}`} style={style} title={e.title}>{e.title}</div>
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Mobile Calendar ───────────────────────────────────────────────

const DOW_JP = ['日', '月', '火', '水', '木', '金', '土']

function formatDateLabel(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日(${DOW_JP[d.getDay()]})`
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return ''
  const fmt = (s: string) => {
    const d = parseLocalDate(s)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  if (!end || end === start) return fmt(start)
  return `${fmt(start)}–${fmt(end)}`
}

interface MobileCalendarGridProps {
  year: number
  month: number
  projects: ProjectDto[]
  selectedDate: Date
  onSelectDate: (d: Date) => void
  onProjectClick: (project: ProjectDto) => void
}

const MOBILE_MAX_CHIPS = 3

const MobileCalendarGrid = ({ year, month, projects, selectedDate, onSelectDate, onProjectClick }: MobileCalendarGridProps) => {
  const days = ['日', '月', '火', '水', '木', '金', '土']
  const cells = buildCells(year, month)

  return (
    <div style={{ background: 'var(--card)', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {days.map((d, i) => (
          <div key={d} style={{
            padding: '4px 0', fontSize: 10, fontWeight: 600, textAlign: 'center',
            color: i === 0 ? 'var(--red)' : i === 6 ? 'var(--blue)' : 'var(--text-3)',
          }}>{d}</div>
        ))}
      </div>

      {/* Grid rows */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {cells.map((row, week) => (
        <div key={week} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: week < 5 ? '1px solid var(--border)' : 'none', flex: 1 }}>
          {row.map((cell, col) => {
            const isSelected = cell.fullDate.toDateString() === selectedDate.toDateString()
            const dayProjects = getDateProjects(projects, cell.fullDate)
            const visible = dayProjects.slice(0, MOBILE_MAX_CHIPS)
            const overflow = dayProjects.length - MOBILE_MAX_CHIPS

            return (
              <button
                key={col}
                onClick={() => onSelectDate(cell.fullDate)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  justifyContent: 'flex-start',
                  padding: '3px 1px 4px', gap: 2,
                  border: 'none',
                  background: isSelected ? 'var(--accent-soft)' : 'transparent',
                  cursor: 'pointer', fontFamily: 'inherit',
                  height: '100%', width: '100%', minWidth: 0, overflow: 'hidden',
                }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, borderRadius: '50%', fontSize: 11.5,
                  fontWeight: isSelected || cell.isToday ? 700 : 400,
                  background: isSelected || cell.isToday ? 'var(--accent)' : 'transparent',
                  color: isSelected || cell.isToday
                    ? 'var(--on-accent)'
                    : cell.isOther
                      ? 'var(--text-4)'
                      : col === 0
                        ? 'var(--red)'
                        : col === 6
                          ? 'var(--blue)'
                          : 'var(--text)',
                  lineHeight: 1, flexShrink: 0,
                }}>
                  {cell.date}
                </span>
                <div style={{ width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {visible.map(p => {
                    const _bar = p.statusColor ?? '#9CA3AF'
                    const cfg = { bg: _bar + '18', bar: _bar, text: _bar }
                    return (
                      <div
                        key={p.id}
                        onClick={(e) => { e.stopPropagation(); onProjectClick(p) }}
                        style={{
                          height: 13, borderRadius: 2,
                          background: cfg.bg,
                          borderLeft: `2px solid ${cfg.bar}`,
                          fontSize: 9, fontWeight: 600, color: cfg.text,
                          paddingLeft: 2,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          lineHeight: '13px',
                          cursor: 'pointer',
                        }}
                      >
                        {p.title}
                      </div>
                    )
                  })}
                  {overflow > 0 && (
                    <div style={{ fontSize: 9, color: 'var(--text-3)', paddingLeft: 2, lineHeight: '12px' }}>
                      +{overflow}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      ))}
      </div>
    </div>
  )
}

interface MobileDayEventsProps {
  date: Date
  projects: ProjectDto[]
  onProjectClick: (project: ProjectDto) => void
  isLoading: boolean
}

const MobileDayEvents = ({ date, projects, onProjectClick, isLoading }: MobileDayEventsProps) => {
  const dayProjects = getDateProjects(projects, date)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
      <div style={{
        padding: '12px 16px 8px',
        fontSize: 13, fontWeight: 600, color: 'var(--text-2)',
        borderBottom: '1px solid var(--divider)',
        position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1,
      }}>
        {formatDateLabel(date)}
      </div>

      {isLoading ? (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} style={{ height: 56, borderRadius: 8, background: 'var(--card-2)' }} />
          ))}
        </div>
      ) : dayProjects.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 13 }}>
          予定なし
        </div>
      ) : (
        <div style={{ padding: '8px 0' }}>
          {dayProjects.map((p, i) => {
            const _c = p.statusColor ?? '#9CA3AF'
            const cfg = { bg: _c + '18', bar: _c, text: _c }
            const dateStr = formatDateRange(p.startDate, p.endDate)
            return (
              <button
                key={p.id}
                onClick={() => onProjectClick(p)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', border: 'none', background: 'transparent',
                  borderTop: i > 0 ? '1px solid var(--divider)' : 'none',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                }}
              >
                <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: cfg.bar, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.title}
                  </div>
                  {dateStr && (
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{dateStr}</div>
                  )}
                </div>
                <StatusChip name={p.statusName ?? ''} color={p.statusColor ?? '#9CA3AF'} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Mobile week strip ─────────────────────────────────────────────

interface MobileWeekStripProps {
  weekStart: Date
  projects: ProjectDto[]
  selectedDate: Date
  onSelectDate: (d: Date) => void
}

const MobileWeekStrip = ({ weekStart, projects, selectedDate, onSelectDate }: MobileWeekStripProps) => {
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  return (
    <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '6px 0 8px', flexShrink: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {DOW_JP.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, marginBottom: 4, color: i === 0 ? 'var(--red)' : i === 6 ? 'var(--blue)' : 'var(--text-3)' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {days.map((day, i) => {
          const isSelected = day.toDateString() === selectedDate.toDateString()
          const isToday = day.toDateString() === today.toDateString()
          const dayProjects = getDateProjects(projects, day)
          const dots = dayProjects.slice(0, 3).map(p => p.statusColor ?? '#9CA3AF')
          return (
            <button key={i} onClick={() => onSelectDate(day)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '2px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, borderRadius: '50%', fontSize: 15,
                fontWeight: isSelected || isToday ? 700 : 400,
                background: isSelected ? 'var(--accent)' : isToday ? 'var(--accent-soft)' : 'transparent',
                color: isSelected ? 'var(--on-accent)' : i === 0 ? 'var(--red)' : i === 6 ? 'var(--blue)' : 'var(--text)',
              }}>
                {day.getDate()}
              </span>
              <div style={{ display: 'flex', gap: 2, height: 5, alignItems: 'center' }}>
                {dots.map((color, j) => (
                  <span key={j} style={{ width: 5, height: 5, borderRadius: '50%', background: isSelected ? 'var(--on-accent)' : color }} />
                ))}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Mobile timeline view ──────────────────────────────────────────

interface MobileTimelineViewProps {
  year: number
  month: number
  projects: ProjectDto[]
  onProjectClick: (project: ProjectDto) => void
  isLoading: boolean
}

const MobileTimelineView = ({ year, month, projects, onProjectClick, isLoading }: MobileTimelineViewProps) => {
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0)

  const sorted = React.useMemo(() => {
    return projects
      .filter(p => {
        if (!p.startDate) return false
        const start = parseLocalDate(p.startDate)
        const end = p.endDate ? parseLocalDate(p.endDate) : start
        return start <= monthEnd && end >= monthStart
      })
      .sort((a, b) => {
        const aMs = a.startDate ? parseLocalDate(a.startDate).getTime() : 0
        const bMs = b.startDate ? parseLocalDate(b.startDate).getTime() : 0
        return aMs - bMs
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, year, month])

  if (isLoading) {
    return (
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ height: 60, margin: '0 16px 8px', borderRadius: 8, background: 'var(--card-2)' }} />
        ))}
      </div>
    )
  }

  if (sorted.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 13 }}>
        この月の予定なし
      </div>
    )
  }

  let lastDateLabel = ''
  return (
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
      {sorted.map((p) => {
        const _c = p.statusColor ?? '#9CA3AF'
        const cfg = { bg: _c + '18', bar: _c, text: _c }
        const dateStr = formatDateRange(p.startDate, p.endDate)
        const startDate = p.startDate ? parseLocalDate(p.startDate) : null
        const dateLabel = startDate ? formatDateLabel(startDate) : ''
        const showDateHeader = dateLabel !== lastDateLabel
        if (showDateHeader) lastDateLabel = dateLabel

        return (
          <React.Fragment key={p.id}>
            {showDateHeader && dateLabel && (
              <div style={{
                padding: '10px 16px 4px', fontSize: 12, fontWeight: 700,
                color: 'var(--text-3)', letterSpacing: '0.02em',
                position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1,
              }}>
                {dateLabel}
              </div>
            )}
            <button
              onClick={() => onProjectClick(p)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px', border: 'none', background: 'transparent',
                borderTop: '1px solid var(--divider)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              }}
            >
              <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: cfg.bar, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.title}
                </div>
                {dateStr && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{dateStr}</div>
                )}
              </div>
              <StatusChip name={p.statusName ?? ''} color={p.statusColor ?? '#9CA3AF'} />
            </button>
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────

interface PageCalendarProps {
  openPanel: (project?: ProjectDto) => void
  isMobile?: boolean
}

type CalView = 'month' | 'week' | 'timeline'

const CAL_VIEW_LABELS: Record<CalView, string> = { month: '月', week: '週', timeline: 'タイムライン' }
const CAL_VIEWS: CalView[] = ['month', 'week', 'timeline']

export const PageCalendar = ({ openPanel, isMobile = false }: PageCalendarProps) => {
  const today = new Date()
  const queryClient = useQueryClient()
  const projectLabel = useProjectLabel()
  const [year, setYear] = React.useState(today.getFullYear())
  const [month, setMonth] = React.useState(today.getMonth())
  const [selectedDate, setSelectedDate] = React.useState<Date>(today)
  const [calView, setCalView] = React.useState<CalView>('month')
  const [createDates, setCreateDates] = React.useState<{ start: string; end: string } | null>(null)
  const showCreate = createDates !== null
  const openCreate = (start: string, end: string) => setCreateDates({ start, end })
  const closeCreate = () => setCreateDates(null)
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [statusFilter, setStatusFilter] = React.useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.calendar_status_filter) ?? '[]') } catch { return [] }
  })
  const setStatusFilterPersisted = (v: string[]) => {
    setStatusFilter(v)
    localStorage.setItem(STORAGE_KEYS.calendar_status_filter, JSON.stringify(v))
  }
  const [memberFilter, setMemberFilter] = React.useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.calendar_member_filter) ?? '[]') } catch { return [] }
  })
  const setMemberFilterPersisted = (v: string[]) => {
    setMemberFilter(v)
    localStorage.setItem(STORAGE_KEYS.calendar_member_filter, JSON.stringify(v))
  }
  const filterBtnRef = React.useRef<HTMLDivElement>(null)
  const { data: projects = [], isLoading } = useQuery<ProjectDto[]>({
    queryKey: ['projects'],
    queryFn: () => fetchWithAuth('/api/projects').then(r => r.json()),
  })
  const { data: allStatuses = [] } = useQuery<ProjectStatusDto[]>({
    queryKey: ['statuses'],
    queryFn: () => fetchWithAuth('/api/projects/statuses').then(r => r.json()),
  })

  const { data: gcalStatus } = useQuery<GcalStatusDto>({
    queryKey: ['gcal-status'],
    queryFn: () => fetchWithAuth('/api/calendar/google/status').then(r => r.json()),
    staleTime: 60 * 1000,
  })
  const gcalConnected = gcalStatus?.connected ?? false

  const [hiddenGcalCalendars, setHiddenGcalCalendars] = React.useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.calendar_gcal_hidden) ?? '[]') } catch { return [] }
  })
  const setHiddenGcalCalendarsPersisted = (v: string[]) => {
    setHiddenGcalCalendars(v)
    localStorage.setItem(STORAGE_KEYS.calendar_gcal_hidden, JSON.stringify(v))
  }
  const [gcalFilterOpen, setGcalFilterOpen] = React.useState(false)
  const gcalFilterBtnRef = React.useRef<HTMLDivElement>(null)

  const { data: gcalEventsRaw = [] } = useQuery<GcalEventDto[]>({
    queryKey: ['gcal-events', year, month],
    queryFn: () => fetchWithAuth(`/api/calendar/google/events?year=${year}&month=${month}`).then(r => r.json()),
    staleTime: 15 * 60 * 1000,
    enabled: gcalConnected,
  })

  const gcalCalendars = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const ev of gcalEventsRaw) {
      const name = ev.calendarName ?? '（名称なし）'
      if (!map.has(name)) map.set(name, ev.calendarColor ?? '#4285F4')
    }
    return [...map.entries()].map(([name, color]) => ({ name, color }))
  }, [gcalEventsRaw])

  const visibleGcalEvents = React.useMemo(
    () => gcalEventsRaw.filter(ev => !hiddenGcalCalendars.includes(ev.calendarName ?? '（名称なし）')),
    [gcalEventsRaw, hiddenGcalCalendars],
  )

  const gcalDisplayEvents = React.useMemo(
    () => (gcalConnected ? buildGcalEvents(visibleGcalEvents, year, month) : []),
    [visibleGcalEvents, year, month, gcalConnected],
  )

  const allMembers = React.useMemo(
    () => [...new Set(projects.flatMap(p => p.memberNames))].sort(),
    [projects],
  )

  const visibleProjects = React.useMemo(() => {
    let result = projects
    if (statusFilter.length > 0) result = result.filter(p => p.statusName != null && statusFilter.includes(p.statusName))
    if (memberFilter.length > 0) result = result.filter(p => memberFilter.some(m => p.memberNames.includes(m)))
    return result
  }, [projects, statusFilter, memberFilter])

  const events = React.useMemo(
    () => buildEvents(visibleProjects, year, month),
    [visibleProjects, year, month],
  )

  const weekStart = getWeekStart(selectedDate)

  const weekEvents = React.useMemo(
    () => buildWeekEvents(visibleProjects, weekStart),
    [visibleProjects, weekStart],
  )

  const gcalWeekDisplayEvents = React.useMemo(
    () => (gcalConnected ? buildGcalWeekEvents(visibleGcalEvents.filter(ev => ev.isAllDay), weekStart) : []),
    [visibleGcalEvents, weekStart, gcalConnected],
  )

  const gcalTimedEvents = React.useMemo(
    () => (gcalConnected ? buildGcalTimedEvents(visibleGcalEvents, weekStart) : []),
    [visibleGcalEvents, weekStart, gcalConnected],
  )

  const goToday = () => {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
    setSelectedDate(today)
  }
  const goPrev = () => {
    if (calView === 'week') {
      setSelectedDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })
    } else {
      if (month === 0) { setYear(y => y - 1); setMonth(11) }
      else setMonth(m => m - 1)
    }
  }
  const goNext = () => {
    if (calView === 'week') {
      setSelectedDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })
    } else {
      if (month === 11) { setYear(y => y + 1); setMonth(0) }
      else setMonth(m => m + 1)
    }
  }

  const isCurrentPeriod = calView === 'week'
    ? weekStart.toDateString() === getWeekStart(today).toDateString()
    : year === today.getFullYear() && month === today.getMonth()

  const periodLabel = calView === 'week' ? formatWeekRange(weekStart) : formatYM(year, month)

  // ── Mobile layout ──────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)', paddingBottom: 'calc(65px + env(safe-area-inset-bottom))' }}>
        <MobileHeader
          title="カレンダー"
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {!isCurrentPeriod && (
                <button
                  onClick={goToday}
                  style={{
                    border: '1px solid var(--border)', borderRadius: 7, background: 'transparent',
                    color: 'var(--accent)', fontSize: 12, fontWeight: 600,
                    padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit', marginRight: 4,
                  }}
                >
                  今日
                </button>
              )}
              <button
                onClick={goPrev}
                style={{ width: 30, height: 30, border: 'none', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}
              >
                <Icon name="chevLeft" size={16} />
              </button>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', minWidth: calView === 'week' ? 100 : 72, textAlign: 'center' }}>
                {periodLabel}
              </span>
              <button
                onClick={goNext}
                style={{ width: 30, height: 30, border: 'none', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}
              >
                <Icon name="chevRight" size={16} />
              </button>
            </div>
          }
        />
        <div style={{ display: 'flex', background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
          {CAL_VIEWS.map(v => (
            <button
              key={v}
              onClick={() => setCalView(v)}
              style={{
                flex: 1, padding: '8px 4px', border: 'none', background: 'transparent',
                fontSize: 13, fontWeight: calView === v ? 700 : 500,
                color: calView === v ? 'var(--accent)' : 'var(--text-3)',
                borderBottom: `2px solid ${calView === v ? 'var(--accent)' : 'transparent'}`,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'color .12s',
              }}
            >
              {CAL_VIEW_LABELS[v]}
            </button>
          ))}
        </div>
        {calView === 'month' && (
          <MobileCalendarGrid
            year={year}
            month={month}
            projects={visibleProjects}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onProjectClick={openPanel}
          />
        )}
        {calView === 'week' && (
          <>
            <MobileWeekStrip
              weekStart={weekStart}
              projects={visibleProjects}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
            <MobileDayEvents
              date={selectedDate}
              projects={visibleProjects}
              onProjectClick={openPanel}
              isLoading={isLoading}
            />
          </>
        )}
        {calView === 'timeline' && (
          <MobileTimelineView
            year={year}
            month={month}
            projects={visibleProjects}
            onProjectClick={openPanel}
            isLoading={isLoading}
          />
        )}
      </div>
    )
  }

  // ── PC layout ──────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '20px 24px', overflow: 'hidden' }}>
      {showCreate && createDates && (
        <CreateProjectModal
          onClose={closeCreate}
          onCreated={(p) => {
            queryClient.setQueryData<ProjectDto[]>(['projects'], prev => [...(prev ?? []), p])
            closeCreate()
          }}
          initialStartDate={createDates.start}
          initialEndDate={createDates.end}
        />
      )}
      {/* Toolbar */}
      <PageToolbar
        style={{ marginBottom: 14 }}
        left={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className="btn"
              style={{ opacity: isCurrentPeriod ? 0.5 : 1 }}
              onClick={goToday}
              disabled={isCurrentPeriod}
            >
              今日
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button className="btn btn-ghost" style={{ width: 32, padding: 0, justifyContent: 'center', height: 32 }} onClick={goPrev}>
                <Icon name="chevLeft" size={15} />
              </button>
              <button className="btn btn-ghost" style={{ width: 32, padding: 0, justifyContent: 'center', height: 32 }} onClick={goNext}>
                <Icon name="chevRight" size={15} />
              </button>
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', padding: '0 4px', whiteSpace: 'nowrap' }}>
              {periodLabel}
            </span>
          </div>
        }
        right={
          <>
            <SegmentedControl
              options={[
                { id: 'month',    label: '月' },
                { id: 'week',     label: '週' },
                { id: 'timeline', label: 'リスト' },
              ]}
              value={calView}
              onChange={(v) => setCalView(v as CalView)}
            />
            {gcalConnected && gcalCalendars.length > 0 && (
              <div ref={gcalFilterBtnRef} style={{ position: 'relative' }}>
                <button
                  className="btn"
                  onClick={() => setGcalFilterOpen(o => !o)}
                  title="Google カレンダーの表示切り替え"
                  style={hiddenGcalCalendars.length > 0 ? { opacity: 0.6 } : { borderColor: 'var(--accent)', color: 'var(--accent-text)', background: 'var(--accent-soft)' }}
                >
                  <Icon name={hiddenGcalCalendars.length < gcalCalendars.length ? 'eye' : 'eye-off'} size={13} /> Google カレンダー
                </button>
                {gcalFilterOpen && (
                  <GcalCalendarPopover
                    containerRef={gcalFilterBtnRef}
                    calendars={gcalCalendars}
                    hidden={hiddenGcalCalendars}
                    onChange={setHiddenGcalCalendarsPersisted}
                    onClose={() => setGcalFilterOpen(false)}
                  />
                )}
              </div>
            )}
            <div ref={filterBtnRef} style={{ position: 'relative' }}>
              <button
                className="btn"
                onClick={() => setFilterOpen(o => !o)}
                style={(statusFilter.length + memberFilter.length) > 0 ? { borderColor: 'var(--accent)', color: 'var(--accent-text)', background: 'var(--accent-soft)' } : {}}
              >
                <Icon name="filter" size={13} /> フィルター
                {(statusFilter.length + memberFilter.length) > 0 && (
                  <span style={{ marginLeft: 4, background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 999, fontSize: 10, fontWeight: 700, padding: '1px 5px' }}>
                    {statusFilter.length + memberFilter.length}
                  </span>
                )}
              </button>
              {filterOpen && (
                <FilterPopover
                  containerRef={filterBtnRef}
                  allStatuses={allStatuses} selected={statusFilter} onChange={setStatusFilterPersisted}
                  allMembers={allMembers} selectedMembers={memberFilter} onChangeMembers={setMemberFilterPersisted}
                  onClose={() => setFilterOpen(false)}
                />
              )}
            </div>
            <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { const t = formatISO(new Date()); openCreate(t, t) }}>
              <Icon name="plus" size={13} strokeWidth={2.4} /> 新規{projectLabel}
            </button>
          </>
        }
      />

      {/* Calendar grid */}
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {calView === 'week' ? (
          <CalendarWeekGrid
            weekStart={weekStart}
            events={weekEvents}
            gcalEvents={gcalWeekDisplayEvents}
            timedEvents={gcalTimedEvents}
            onEventClick={openPanel}
            onDateSelect={openCreate}
            isLoading={isLoading}
          />
        ) : (
          <CalendarGrid
            year={year}
            month={month}
            events={events}
            gcalEvents={gcalDisplayEvents}
            onEventClick={openPanel}
            onDateSelect={openCreate}
            isLoading={isLoading}
          />
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, fontSize: 11.5, color: 'var(--text-3)' }}>
        {allStatuses.map(s => (
          <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: s.color + '18', borderLeft: `2px solid ${s.color}` }} />
            {s.name}
          </span>
        ))}
        {!isLoading && projects.length > 0 && (
          <span style={{ marginLeft: 'auto', color: 'var(--text-4)' }}>
            {projects.filter(p => p.startDate).length} 件のプロジェクトに日程設定済み
          </span>
        )}
      </div>
    </div>
  )
}
