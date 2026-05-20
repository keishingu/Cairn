'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Icon } from '../primitives'
import { STATUS, STATUS_COL } from '../data'
import type { StatusKey } from '../data'
import type { ProjectDto } from '@/app/api/projects/route'

// ─── Date helpers ──────────────────────────────────────────────────

function getCalendarStart(year: number, month: number): Date {
  const d = new Date(year, month, 1)
  d.setDate(d.getDate() - d.getDay()) // back to Sunday
  return d
}

function daysBetween(a: Date, b: Date): number {
  // Use UTC date components to avoid DST-induced hour differences
  const aUTC = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const bUTC = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((bUTC - aUTC) / 86400000)
}

function formatYM(year: number, month: number): string {
  return `${year}年${month + 1}月`
}

// ─── Calendar cell data ────────────────────────────────────────────

interface CalCell {
  date: number
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

    const start = new Date(project.startDate + 'T00:00:00')
    const end = project.endDate ? new Date(project.endDate + 'T00:00:00') : new Date(start)

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

  // Greedy row assignment per week
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

// ─── Calendar grid ─────────────────────────────────────────────────

const DATE_AREA = 28  // px reserved for date number at top of each row
const EVENT_H = 22    // event bar height
const EVENT_GAP = 2   // gap between event bars
const MAX_ROWS = 3    // max visible events per cell

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
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {days.map((d, i) => (
          <div key={d} style={{
            padding: '8px 12px', fontSize: 11, fontWeight: 600,
            color: i === 0 ? 'var(--red)' : i === 6 ? 'var(--blue)' : 'var(--text-3)',
            textAlign: 'left', letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>{d}</div>
        ))}
      </div>

      {/* Grid rows */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Date cells */}
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

        {/* Event bars */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {isLoading ? (
            // Loading skeleton bars
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
              // CSS calc: row fraction (%) + pixel offset within row
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

// ─── Page ──────────────────────────────────────────────────────────

interface PageCalendarProps {
  openPanel: (project?: ProjectDto) => void
}

export const PageCalendar = ({ openPanel }: PageCalendarProps) => {
  const today = new Date()
  const [year, setYear] = React.useState(today.getFullYear())
  const [month, setMonth] = React.useState(today.getMonth())

  const { data: projects = [], isLoading } = useQuery<ProjectDto[]>({
    queryKey: ['projects'],
    queryFn: () => fetch('/api/projects').then(r => r.json()),
  })

  const events = React.useMemo(
    () => buildEvents(projects, year, month),
    [projects, year, month],
  )

  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()) }
  const goPrev = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  const goNext = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '20px 24px', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="btn"
            style={{ height: 32, opacity: isCurrentMonth ? 0.5 : 1 }}
            onClick={goToday}
            disabled={isCurrentMonth}
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
