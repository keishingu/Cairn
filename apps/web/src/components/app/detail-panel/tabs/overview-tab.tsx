'use client'

import React from 'react'
import { Icon, StatusChip } from '../../primitives'
import { ConfirmDialog } from '../../confirm-dialog'
import type { ProjectDto } from '@/app/api/projects/route'
import { LocationInput } from '../../location-input'
import { usePatchProject, useDeleteProject } from '@/hooks/use-patch-project'
import { useProjectStatuses } from '@/hooks/use-project-statuses'


export function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return '—'
  const fmt = (d: string) => {
    const [, m, day] = d.split('-')
    return `${Number(m)}/${Number(day)}`
  }
  return end && end !== start ? `${fmt(start)} ~ ${fmt(end)}` : fmt(start)
}

const cardLabelStyle: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)',
  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4,
}

// ─── インライン編集フィールド ─────────────────────────────────────
const InlineText = ({
  value, onSave, placeholder, multiline = false, large = false, required = false,
}: {
  value: string
  onSave: (v: string) => void
  placeholder?: string
  multiline?: boolean
  large?: boolean
  required?: boolean
}) => {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(value)

  React.useEffect(() => { setDraft(value) }, [value])

  const commit = () => {
    setEditing(false)
    if (required && !draft.trim()) { setDraft(value); return }
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
        value={draft}
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
          display: 'inline-flex', alignItems: 'baseline', gap: 4,
          padding: '2px 0', border: 'none',
          background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
        }}
        title="クリックして編集"
      >
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>
          {formatDateRange(startDate, endDate)}
        </span>
        <Icon name="edit" size={10} color="var(--text-4)"/>
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <input type="date" value={start} onChange={e => setStart(e.target.value)} style={inputStyle}/>
        <span style={{ color: 'var(--text-4)', fontSize: 12 }}>〜</span>
        <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={inputStyle}/>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={commit} className="btn btn-primary" style={{ height: 28, padding: '0 10px', fontSize: 12 }}>確定</button>
        <button
          onClick={() => { setEditing(false); setStart(startDate ?? ''); setEnd(endDate ?? '') }}
          className="btn btn-ghost"
          style={{ height: 28, padding: '0 8px', fontSize: 12 }}
        >取消</button>
      </div>
    </div>
  )
}

const InlineStatus = ({
  statusName, onSave,
}: {
  statusName: string | null
  onSave: (name: string) => void
}) => {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  const { data: statuses = [] } = useProjectStatuses()

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
          background: 'transparent', border: 'none',
          padding: '2px 0', cursor: 'pointer',
        }}
        title="クリックして変更"
      >
        <StatusChip name={statusName ?? '—'} color={statuses.find(s => s.name === statusName)?.color ?? '#9CA3AF'}/>
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

const InlineLocation = ({
  location, onSave, onClear,
}: {
  location: string | null
  onSave: (description: string, placeId: string) => void
  onClear: () => void
}) => {
  const [editing, setEditing] = React.useState(false)

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 34, padding: '0 12px',
    border: '1px solid var(--accent)', borderRadius: 7,
    background: 'var(--card)', color: 'var(--text)',
    fontSize: 12.5, fontFamily: 'inherit', outline: 'none',
    boxSizing: 'border-box',
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '2px 0', border: 'none',
          background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
          maxWidth: '100%',
        }}
        title="クリックして編集"
      >
        <Icon name="map-pin" size={12} color={location ? 'var(--accent-text)' : 'var(--text-4)'}/>
        <span style={{ fontSize: 13, color: location ? 'var(--text)' : 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {location ?? '場所を設定…'}
        </span>
        <Icon name="edit" size={10} color="var(--text-4)"/>
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <LocationInput
        value={location ?? ''}
        onSelect={(desc, pid) => { onSave(desc, pid); setEditing(false) }}
        onClear={() => { onClear(); setEditing(false) }}
        inputStyle={inputStyle}
        placeholder="場所を検索…"
      />
      <button
        onClick={() => setEditing(false)}
        className="btn btn-ghost"
        style={{ alignSelf: 'flex-start', height: 26, fontSize: 11.5, padding: '0 8px' }}
      >
        キャンセル
      </button>
    </div>
  )
}

// ─── 概要タブ本体 ─────────────────────────────────────────────────
interface OverviewTabProps {
  project: ProjectDto
  onDeleted: () => void
}

export const OverviewTab = ({ project, onDeleted }: OverviewTabProps) => {
  const patch = usePatchProject(project.id)
  const archivePatch = usePatchProject(project.id)
  const deleteMutation = useDeleteProject(project.id)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* タイトル */}
      <InlineText
        value={project.title}
        onSave={v => patch.mutate({ title: v })}
        placeholder="プロジェクト名"
        large
        required
      />

      {patch.isError && (
        <div style={{ fontSize: 11.5, color: 'var(--red-text)', marginTop: -10 }}>
          ⚠ {(patch.error as Error).message}
        </div>
      )}

      {/* 日程 + ステータス */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
          <div style={cardLabelStyle}>日程</div>
          <InlineDatePair
            startDate={project.startDate}
            endDate={project.endDate}
            onSave={(start, end) => patch.mutate({ startDate: start, endDate: end })}
          />
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{project.memberCount}人参加</div>
        </div>
        <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
          <div style={cardLabelStyle}>ステータス</div>
          <InlineStatus
            statusName={project.statusName}
            onSave={name => patch.mutate({ statusName: name })}
          />
        </div>
      </div>

      {/* 場所 */}
      <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
        <div style={cardLabelStyle}>場所</div>
        <InlineLocation
          location={project.location}
          onSave={(desc, pid) => patch.mutate({ location: desc, placeId: pid })}
          onClear={() => patch.mutate({ location: null, placeId: null })}
        />
      </div>

      {/* サマリー */}
      <div style={{ padding: 14, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
        <div style={cardLabelStyle}>サマリー</div>
        <InlineText
          value={project.description ?? ''}
          onSave={v => patch.mutate({ description: v || null })}
          placeholder="プロジェクトの概要や目標をクリックして入力…"
          multiline
        />
      </div>

      {/* アーカイブ */}
      <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
        <div style={cardLabelStyle}>アーカイブ</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 8 }}>
          {project.archived
            ? 'このプロジェクトはアーカイブされています。解除するとプロジェクト一覧に再表示されます。'
            : 'アーカイブすると一覧の「アーカイブ」タブに移動します。データは保持されます。'}
        </div>
        {archivePatch.isError && (
          <div style={{ fontSize: 11.5, color: 'var(--red-text)', marginBottom: 6 }}>⚠ 操作に失敗しました</div>
        )}
        <button
          onClick={() => archivePatch.mutate({ archived: !project.archived })}
          disabled={archivePatch.isPending}
          className="btn btn-ghost"
          style={{ height: 30, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
        >
          <Icon name={project.archived ? 'refresh' : 'close'} size={11}/>
          {archivePatch.isPending ? '処理中…' : project.archived ? 'アーカイブを解除する' : 'アーカイブする'}
        </button>
      </div>

      {/* 削除 */}
      <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
        <div style={cardLabelStyle}>削除</div>
        <button
          onClick={() => setConfirmDelete(true)}
          style={{ width: '100%', padding: '7px 12px', borderRadius: 7, border: '1px solid var(--red)', background: 'transparent', color: 'var(--red-text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          プロジェクトを削除する
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="プロジェクトを削除"
        message={`「${project.title}」を削除しますか？チャット・ファイル・タスクを含むすべてのデータが完全に削除されます。この操作は取り消せません。`}
        onConfirm={async () => {
          await deleteMutation.mutateAsync()
          onDeleted()
        }}
        onClose={() => setConfirmDelete(false)}
      />

    </div>
  )
}
