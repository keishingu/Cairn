'use client'

import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon, StatusChip } from '../../primitives'
import type { ProjectDto } from '@/app/api/projects/route'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'
import type { StatusKey } from '../../data'

export function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return '—'
  const fmt = (d: string) => {
    const [, m, day] = d.split('-')
    return `${Number(m)}/${Number(day)}`
  }
  return end && end !== start ? `${fmt(start)} ~ ${fmt(end)}` : fmt(start)
}

// ─── 1フィールドを保存するヘルパー ────────────────────────────────
function usePatchProject(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? '更新に失敗しました')
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })
}

// ─── インライン編集フィールド ─────────────────────────────────────
const InlineText = ({
  value, onSave, placeholder, multiline = false, large = false,
}: {
  value: string
  onSave: (v: string) => void
  placeholder?: string
  multiline?: boolean
  large?: boolean
}) => {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(value)

  React.useEffect(() => { setDraft(value) }, [value])

  const commit = () => {
    setEditing(false)
    if (draft.trim() !== value.trim()) onSave(draft.trim())
  }

  const baseStyle: React.CSSProperties = {
    width: '100%', fontFamily: 'inherit', outline: 'none',
    background: editing ? 'var(--card)' : 'transparent',
    border: editing ? '1px solid var(--accent)' : '1px solid transparent',
    borderRadius: 7, transition: 'border-color .15s, background .15s',
    color: 'var(--text)',
    fontSize: large ? 15 : 13,
    fontWeight: large ? 700 : 400,
    padding: editing ? '6px 8px' : '4px 2px',
    lineHeight: 1.55,
    resize: 'none' as const,
    boxSizing: 'border-box' as const,
    cursor: editing ? 'text' : 'pointer',
  }

  if (multiline) {
    return (
      <textarea
        value={draft || (editing ? '' : '')}
        placeholder={editing ? placeholder : (value ? undefined : placeholder)}
        rows={3}
        style={{ ...baseStyle, minHeight: 64 }}
        onFocus={() => setEditing(true)}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
      />
    )
  }

  return (
    <input
      type="text"
      value={draft}
      placeholder={editing ? placeholder : (value ? undefined : placeholder)}
      style={baseStyle}
      onFocus={() => setEditing(true)}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    />
  )
}

const InlineDatePair = ({
  startDate, endDate, onSave,
}: {
  startDate: string | null
  endDate: string | null
  onSave: (start: string | null, end: string | null) => void
}) => {
  const [editing, setEditing] = React.useState(false)
  const [start, setStart] = React.useState(startDate ?? '')
  const [end, setEnd]     = React.useState(endDate ?? '')

  React.useEffect(() => { setStart(startDate ?? ''); setEnd(endDate ?? '') }, [startDate, endDate])

  const commit = () => {
    setEditing(false)
    const ns = start || null
    const ne = end || null
    if (ns !== startDate || ne !== endDate) onSave(ns, ne)
  }

  const inputStyle: React.CSSProperties = {
    height: 30, padding: '0 8px', borderRadius: 6,
    border: '1px solid var(--border)', background: 'var(--card)',
    color: 'var(--text)', fontSize: 12.5, fontFamily: 'inherit', outline: 'none',
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 8px', borderRadius: 7, border: '1px solid transparent',
          background: 'transparent', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
          cursor: 'pointer', transition: 'background .12s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <Icon name="calendar" size={13} color="var(--text-4)"/>
        <span style={{ fontWeight: 500 }}>{formatDateRange(startDate, endDate)}</span>
        <Icon name="edit" size={11} color="var(--text-4)"/>
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <input type="date" value={start} onChange={e => setStart(e.target.value)} style={inputStyle}/>
      <span style={{ color: 'var(--text-4)', fontSize: 12 }}>〜</span>
      <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={inputStyle}/>
      <button
        onClick={commit}
        className="btn btn-primary"
        style={{ height: 30, padding: '0 10px', fontSize: 12, flexShrink: 0 }}
      >確定</button>
      <button
        onClick={() => { setEditing(false); setStart(startDate ?? ''); setEnd(endDate ?? '') }}
        className="btn btn-ghost"
        style={{ height: 30, padding: '0 8px', fontSize: 12 }}
      >取消</button>
    </div>
  )
}

const InlineStatus = ({
  statusName, onSave,
}: {
  statusName: StatusKey
  onSave: (name: string) => void
}) => {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  const { data: statuses = [] } = useQuery<ProjectStatusDto[]>({
    queryKey: ['statuses'],
    queryFn: () => fetch('/api/projects/statuses').then(r => r.json()),
  })

  React.useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: 'transparent', border: '1px solid transparent',
          padding: '3px 6px 3px 2px', borderRadius: 7, cursor: 'pointer',
          transition: 'background .12s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <StatusChip s={statusName}/>
        <Icon name="chevDown" size={11} color="var(--text-4)"/>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 20,
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 9, boxShadow: 'var(--shadow-lg)', minWidth: 140, padding: 4,
        }}>
          {statuses.map(s => (
            <button
              key={s.id}
              onClick={() => { onSave(s.name); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                padding: '7px 10px', border: 'none', background: 'transparent',
                color: 'var(--text)', fontSize: 12.5, fontFamily: 'inherit',
                cursor: 'pointer', borderRadius: 6,
                fontWeight: s.name === statusName ? 600 : 400,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }}/>
              {s.name}
              {s.name === statusName && <Icon name="check" size={11} color="var(--accent)" style={{ marginLeft: 'auto' }}/>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 概要タブ本体 ─────────────────────────────────────────────────
export const OverviewTab = ({ project }: { project: ProjectDto }) => {
  const patch = usePatchProject(project.id)

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>

      {/* タイトル */}
      <InlineText
        value={project.title}
        onSave={v => patch.mutate({ title: v })}
        placeholder="プロジェクト名"
        large
      />

      {/* ステータス・日程 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', padding: '2px 0' }}>
        <InlineStatus
          statusName={project.statusName}
          onSave={name => patch.mutate({ statusName: name })}
        />
        <span style={{ color: 'var(--text-4)', fontSize: 12 }}>·</span>
        <InlineDatePair
          startDate={project.startDate}
          endDate={project.endDate}
          onSave={(start, end) => patch.mutate({ startDate: start, endDate: end })}
        />
      </div>

      {patch.isError && (
        <div style={{ fontSize: 11.5, color: 'var(--red-text)', padding: '4px 2px' }}>
          ⚠ {(patch.error as Error).message}
        </div>
      )}

      {/* 説明 */}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4, padding: '0 2px' }}>説明</div>
        <InlineText
          value={project.description ?? ''}
          onSave={v => patch.mutate({ description: v || null })}
          placeholder="プロジェクトの概要や目標をクリックして入力…"
          multiline
        />
      </div>

      {/* 統計 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
        <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>メンバー</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{project.memberCount}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>人参加</div>
        </div>
        <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>タスク</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
            {project.completedTaskCount}
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-3)' }}>/{project.taskCount}</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>完了</div>
        </div>
      </div>

    </div>
  )
}
