'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Icon, StatusChip } from '../primitives'
import { STATUS, STATUS_COL } from '../data'
import type { StatusKey } from '../data'
import type { ProjectDto } from '@/app/api/projects/route'
import { MobileHeader } from '@/components/app/mobile/header'
import { ProjectPanel } from '../detail-panel/project-panel'

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
  onEventClick: (project: ProjectDto) => void
  isLoading: boolean
}

const CalendarGrid = ({ year, month, events, onEventClick, isLoading }: CalendarGridProps) => {
  const days = ['日', '月', '火', '水', '木', '金', '土']
  const cells = buildCells(year, month)

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

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: 'repeat(6, 1fr)', height: '100%' }}>
          {cells.flat().map((cell, i) => {
            const week = Math.floor(i / 7)
            const day = i % 7
            return (
              <div key={i} style={{
                borderRight: day < 6 ? '1px solid var(--border)' : 'none',
                borderBottom: week < 5 ? '1px solid var(--border)' : 'none',
                padding: 6,
                background: cell.isToday ? 'var(--accent-soft)' : 'transparent',
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
            events.filter(e => e.row < MAX_ROWS).map((e, i) => {
              const cfg = STATUS_COL[e.project.statusName as StatusKey]
              const colW = 100 / 7
              const left = `calc(${e.day * colW}% + 4px)`
              const width = `calc(${e.span * colW}% - 8px)`
              const topOffset = DATE_AREA + e.row * (EVENT_H + EVENT_GAP)
              const top = `calc(${e.week} / 6 * 100% + ${topOffset}px)`
              return (
                <button
                  key={i}
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
                  onMouseEnter={e2 => { (e2.currentTarget as HTMLElement).style.filter = 'brightness(0.95)' }}
                  onMouseLeave={e2 => { (e2.currentTarget as HTMLElement).style.filter = 'none' }}
                  title={e.project.title}
                >
                  {e.project.title}
                </button>
              )
            })
          )}
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
                    const cfg = STATUS_COL[p.statusName as StatusKey]
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
            const cfg = STATUS_COL[p.statusName as StatusKey]
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
                <StatusChip s={p.statusName as StatusKey} />
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
          const dots = dayProjects.slice(0, 3).map(p => STATUS_COL[p.statusName as StatusKey]?.bar ?? 'var(--text-3)')
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
        const cfg = STATUS_COL[p.statusName as StatusKey]
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
              <StatusChip s={p.statusName as StatusKey} />
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
  const [year, setYear] = React.useState(today.getFullYear())
  const [month, setMonth] = React.useState(today.getMonth())
  const [selectedDate, setSelectedDate] = React.useState<Date>(today)
  const [calView, setCalView] = React.useState<CalView>('month')
  const [selectedProject, setSelectedProject] = React.useState<ProjectDto | null>(null)

  const { data: projects = [], isLoading } = useQuery<ProjectDto[]>({
    queryKey: ['projects'],
    queryFn: () => fetch('/api/projects').then(r => r.json()),
  })

  const events = React.useMemo(
    () => buildEvents(projects, year, month),
    [projects, year, month],
  )

  const weekStart = getWeekStart(selectedDate)

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
            projects={projects}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onProjectClick={setSelectedProject}
          />
        )}
        {selectedProject && (
          <ProjectPanel project={selectedProject} onClose={() => setSelectedProject(null)} isMobile />
        )}
        {calView === 'week' && (
          <>
            <MobileWeekStrip
              weekStart={weekStart}
              projects={projects}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
            <MobileDayEvents
              date={selectedDate}
              projects={projects}
              onProjectClick={openPanel}
              isLoading={isLoading}
            />
          </>
        )}
        {calView === 'timeline' && (
          <MobileTimelineView
            year={year}
            month={month}
            projects={projects}
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
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="btn"
            style={{ height: 32, opacity: isCurrentPeriod ? 0.5 : 1 }}
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
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', padding: '0 4px' }}>
            {formatYM(year, month)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn"><Icon name="filter" size={13} /> フィルター</button>
          <div style={{ display: 'flex', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 2, gap: 0 }}>
            {['月', '週', 'リスト'].map((v, i) => (
              <button key={v} style={{
                padding: '5px 14px', borderRadius: 6, border: 'none',
                background: i === 0 ? 'var(--card)' : 'transparent',
                color: i === 0 ? 'var(--text)' : 'var(--text-3)',
                fontSize: 12.5, fontWeight: i === 0 ? 600 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: i === 0 ? 'var(--shadow-sm)' : 'none',
              }}>{v}</button>
            ))}
          </div>
          <button className="btn btn-primary" style={{ height: 32, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={13} strokeWidth={2.4} /> 予定を追加
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        <CalendarGrid
          year={year}
          month={month}
          events={events}
          onEventClick={openPanel}
          isLoading={isLoading}
        />
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, fontSize: 11.5, color: 'var(--text-3)' }}>
        {(['plan', 'review', 'wait', 'doing', 'retro', 'done'] as const).map(s => (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: STATUS_COL[s].bg, borderLeft: `2px solid ${STATUS_COL[s].bar}` }} />
            {STATUS[s].label}
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
