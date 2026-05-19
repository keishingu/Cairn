'use client'

import React from 'react'
import { Icon } from '../primitives'
import { STATUS, STATUS_COL } from '../data'

const EVENTS = [
  { week: 0, day: 5, span: 2, name: '北アルプス縦走計画', color: 'plan' as const, row: 0 },
  { week: 1, day: 0, span: 1, name: '北アルプス縦走計画', color: 'plan' as const, row: 0 },
  { week: 1, day: 2, span: 2, name: '夏山合宿計画',     color: 'wait' as const, row: 0 },
  { week: 1, day: 6, span: 1, name: '沢登り練習会',     color: 'doing' as const, row: 0 },
  { week: 2, day: 1, span: 1, name: 'クライミング講習会', color: 'review' as const, row: 0 },
  { week: 2, day: 4, span: 3, name: '北アルプス縦走計画', color: 'plan' as const, row: 0 },
  { week: 3, day: 0, span: 1, name: '雪山訓練',         color: 'retro' as const, row: 0 },
  { week: 3, day: 1, span: 2, name: '夏山合宿計画',     color: 'wait' as const, row: 0 },
]

const CalendarGrid = ({ onPickProject }: { onPickProject: () => void }) => {
  const days = ['日', '月', '火', '水', '木', '金', '土']
  const dates = [
    [26, 27, 28, 29, 30, 31, 1],
    [2,  3,  4,  5,  6,  7,  8],
    [9, 10, 11, 12, 13, 14, 15],
    [16, 17, 18, 19, 20, 21, 22],
    [23, 24, 25, 26, 27, 28, 29],
    [30, 1, 2, 3, 4, 5, 6],
  ]
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
        {days.map((d, i) => (
          <div key={d} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: i === 0 ? 'var(--red)' : i === 6 ? 'var(--blue)' : 'var(--text-3)', textAlign: 'left', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{d}</div>
        ))}
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateRows: 'repeat(6, 1fr)', gridTemplateColumns: 'repeat(7, 1fr)', position: 'relative' }}>
        {dates.flat().map((d, i) => {
          const week = Math.floor(i / 7)
          const day = i % 7
          const isOther = (week === 0 && d > 7) || (week >= 4 && d < 10)
          const isToday = (week === 2 && d === 12)
          return (
            <div key={i} style={{
              borderRight: day < 6 ? '1px solid var(--border)' : 'none',
              borderBottom: week < 5 ? '1px solid var(--border)' : 'none',
              padding: 8, position: 'relative',
              background: isToday ? 'var(--accent-soft)' : 'transparent',
              minHeight: 0,
            }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12.5, fontWeight: isToday ? 700 : 500,
                color: isToday ? 'var(--on-accent)' : isOther ? 'var(--text-4)' : day === 0 ? 'var(--red)' : day === 6 ? 'var(--blue)' : 'var(--text-2)',
                width: isToday ? 24 : 'auto', height: isToday ? 24 : 'auto',
                borderRadius: isToday ? '50%' : 0,
                background: isToday ? 'var(--accent)' : 'transparent',
              }}>{d}</span>
            </div>
          )
        })}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {EVENTS.map((e, i) => {
            const cfg = STATUS_COL[e.color]
            const left  = `calc(${(e.day / 7) * 100}% + 4px)`
            const width = `calc(${(e.span / 7) * 100}% - 8px)`
            const top   = `calc(${(e.week / 6) * 100}% + 30px)`
            return (
              <button key={i} onClick={() => onPickProject()} style={{
                position: 'absolute', left, top, width,
                height: 22, borderRadius: 5,
                background: cfg.bg, color: cfg.text,
                border: 'none', borderLeft: `3px solid ${cfg.bar}`,
                fontSize: 11, fontWeight: 600,
                padding: '0 7px', textAlign: 'left',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontFamily: 'inherit', pointerEvents: 'auto', cursor: 'pointer',
              }}>{e.name}</button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface PageCalendarProps {
  openPanel: () => void
}

export const PageCalendar = ({ openPanel }: PageCalendarProps) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '20px 24px', overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn" style={{ height: 32 }}>今日</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button className="btn btn-ghost" style={{ width: 32, padding: 0, justifyContent: 'center', height: 32 }}><Icon name="chevLeft" size={15}/></button>
          <button className="btn btn-ghost" style={{ width: 32, padding: 0, justifyContent: 'center', height: 32 }}><Icon name="chevRight" size={15}/></button>
        </div>
        <button className="btn btn-ghost" style={{ height: 32, fontWeight: 700, fontSize: 16, padding: '0 8px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          2024年6月 <Icon name="chevDown" size={14}/>
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn"><Icon name="filter" size={13}/> フィルター</button>
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
          <Icon name="plus" size={13} strokeWidth={2.4}/> 予定を作成
        </button>
      </div>
    </div>
    <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      <CalendarGrid onPickProject={openPanel}/>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, fontSize: 11.5, color: 'var(--text-3)' }}>
      {(['plan', 'review', 'wait', 'doing', 'retro', 'done'] as const).map(s => (
        <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: STATUS_COL[s].bg, borderLeft: `2px solid ${STATUS_COL[s].bar}` }}/>
          {STATUS[s].label}
        </span>
      ))}
    </div>
  </div>
)
