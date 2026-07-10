'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Icon, StatusChip } from '../../primitives'
import { ConfirmDialog } from '../../confirm-dialog'
import type { ProjectDto } from '@/app/api/projects/route'
import { LocationInput } from '../../location-input'
import { usePatchProject, useDeleteProject } from '@/hooks/use-patch-project'
import { useProjectMilestones } from '@/hooks/use-project-milestones'
import { useProjectStatuses } from '@/hooks/use-project-statuses'
import { useWorkspacePermissions } from '@/hooks/use-current-user'
import { toast } from '@/lib/toast'
import type { MilestoneDto } from '@/app/api/projects/[id]/milestones/route'


const formatTime = (time: string | null) => time ? time.slice(0, 5) : null

export function formatDateRange(start: string | null, end: string | null, startTime?: string | null, endTime?: string | null): string {
  if (!start) return '—'
  const fmt = (d: string) => {
    const [, m, day] = d.split('-')
    return `${Number(m)}/${Number(day)}`
  }
  const st = formatTime(startTime ?? null)
  const et = formatTime(endTime ?? null)
  const startLabel = `${fmt(start)}${st ? ` ${st}` : ''}`
  if (!end || end === start) return et ? `${startLabel} ~ ${et}` : startLabel
  return `${startLabel} ~ ${fmt(end)}${et ? ` ${et}` : ''}`
}

const cardLabelStyle: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)',
  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4,
}

// ─── インライン編集フィールド ─────────────────────────────────────
const InlineText = ({
  value, onSave, placeholder, multiline = false, large = false, required = false, readOnly = false,
}: {
  value: string
  onSave: (v: string) => void
  placeholder?: string
  multiline?: boolean
  large?: boolean
  required?: boolean
  readOnly?: boolean
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
    cursor: readOnly ? 'default' : editing ? 'text' : 'pointer',
  }

  if (multiline) {
    return (
      <textarea
        value={draft}
        placeholder={editing ? placeholder : (value ? undefined : placeholder)}
        rows={3}
        readOnly={readOnly}
        style={{ ...baseStyle, minHeight: 64 }}
        onFocus={() => { if (!readOnly) setEditing(true) }}
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
      readOnly={readOnly}
      style={baseStyle}
      onFocus={() => { if (!readOnly) setEditing(true) }}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    />
  )
}

const InlineDatePair = ({
  startDate, endDate, startTime = null, endTime = null, onSave, readOnly = false,
}: {
  startDate: string | null
  endDate: string | null
  startTime?: string | null
  endTime?: string | null
  onSave: (start: string | null, end: string | null, startTime: string | null, endTime: string | null) => void
  readOnly?: boolean
}) => {
  const [editing, setEditing] = React.useState(false)
  const [start, setStart] = React.useState(startDate ?? '')
  const [end, setEnd]     = React.useState(endDate ?? '')
  const [startClock, setStartClock] = React.useState(formatTime(startTime) ?? '')
  const [endClock, setEndClock] = React.useState(formatTime(endTime) ?? '')
  const wrapRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    setStart(startDate ?? '')
    setEnd(endDate ?? '')
    setStartClock(formatTime(startTime) ?? '')
    setEndClock(formatTime(endTime) ?? '')
  }, [startDate, endDate, startTime, endTime])

  const commit = () => {
    setEditing(false)
    const ns = start || null
    const ne = end || null
    const nst = startClock || null
    const net = endClock || null
    if (ns !== startDate || ne !== endDate || nst !== formatTime(startTime) || net !== formatTime(endTime)) onSave(ns, ne, nst, net)
  }

  const cancel = () => {
    setEditing(false)
    setStart(startDate ?? '')
    setEnd(endDate ?? '')
    setStartClock(formatTime(startTime) ?? '')
    setEndClock(formatTime(endTime) ?? '')
  }

  // フォーカスがペア全体から外れた時だけ確定する（開始↔終了の移動では確定しない）
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (wrapRef.current?.contains(e.relatedTarget as Node | null)) return
    commit()
  }

  const inputStyle: React.CSSProperties = {
    height: 30, padding: '0 8px', borderRadius: 6,
    border: '1px solid var(--border)', background: 'var(--card)',
    color: 'var(--text)', fontSize: 12.5, fontFamily: 'inherit', outline: 'none',
  }

  if (!editing) {
    return (
      <button
        onClick={() => { if (!readOnly) setEditing(true) }}
        disabled={readOnly}
        style={{
          display: 'inline-flex', alignItems: 'baseline', gap: 4,
          padding: '2px 0', border: 'none',
          background: 'transparent', cursor: readOnly ? 'default' : 'pointer', fontFamily: 'inherit',
        }}
        title={readOnly ? undefined : 'クリックして編集'}
      >
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>
          {formatDateRange(startDate, endDate, startTime, endTime)}
        </span>
        {!readOnly && <Icon name="edit" size={10} color="var(--text-4)"/>}
      </button>
    )
  }

  return (
    <div
      ref={wrapRef}
      onBlur={handleBlur}
      style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}
    >
      <input
        type="date"
        value={start}
        autoFocus
        onChange={e => setStart(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') cancel() }}
        style={inputStyle}
      />
      <input
        type="time"
        value={startClock}
        onChange={e => setStartClock(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') cancel() }}
        style={{ ...inputStyle, width: 104 }}
      />
      <span style={{ color: 'var(--text-4)', fontSize: 12 }}>〜</span>
      <input
        type="date"
        value={end}
        onChange={e => setEnd(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') cancel() }}
        style={inputStyle}
      />
      <input
        type="time"
        value={endClock}
        onChange={e => setEndClock(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') cancel() }}
        style={{ ...inputStyle, width: 104 }}
      />
    </div>
  )
}

const InlineStatus = ({
  statusName, onSave, readOnly = false,
}: {
  statusName: string | null
  onSave: (name: string) => void
  readOnly?: boolean
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
        onClick={() => { if (!readOnly) setOpen(v => !v) }}
        disabled={readOnly}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: 'transparent', border: 'none',
          padding: '2px 0', cursor: readOnly ? 'default' : 'pointer',
        }}
        title={readOnly ? undefined : 'クリックして変更'}
      >
        <StatusChip name={statusName ?? '—'} color={statuses.find(s => s.name === statusName)?.color ?? '#9CA3AF'}/>
        {!readOnly && <Icon name="chevDown" size={11} color="var(--text-4)"/>}
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
  location, onSave, onClear, readOnly = false,
}: {
  location: string | null
  onSave: (description: string, placeId: string) => void
  onClear: () => void
  readOnly?: boolean
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
        onClick={() => { if (!readOnly) setEditing(true) }}
        disabled={readOnly}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '2px 0', border: 'none',
          background: 'transparent', cursor: readOnly ? 'default' : 'pointer', fontFamily: 'inherit',
          maxWidth: '100%',
        }}
        title={readOnly ? undefined : 'クリックして編集'}
      >
        <Icon name="map-pin" size={12} color={location ? 'var(--accent-text)' : 'var(--text-4)'}/>
        <span style={{ fontSize: 13, color: location ? 'var(--text)' : 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {location ?? (readOnly ? '未設定' : '場所を設定…')}
        </span>
        {!readOnly && <Icon name="edit" size={10} color="var(--text-4)"/>}
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

const isPastDue = (milestone: MilestoneDto) => {
  if (milestone.completed || !milestone.endDate) return false
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  return milestone.endDate < `${yyyy}-${mm}-${dd}`
}

const MilestoneCreateForm = ({ onCreate, disabled }: {
  onCreate: (input: { title: string; description?: string; startDate?: string; endDate?: string; startTime?: string; endTime?: string }) => void
  disabled?: boolean
}) => {
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [startDate, setStartDate] = React.useState('')
  const [endDate, setEndDate] = React.useState('')
  const [startTime, setStartTime] = React.useState('')
  const [endTime, setEndTime] = React.useState('')

  const reset = () => {
    setTitle('')
    setDescription('')
    setStartDate('')
    setEndDate('')
    setStartTime('')
    setEndTime('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    onCreate({
      title: trimmed,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
    })
    reset()
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="btn btn-ghost"
        style={{ height: 30, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
      >
        <Icon name="plus" size={12}/> 追加
      </button>
    )
  }

  const inputStyle: React.CSSProperties = {
    height: 32,
    border: '1px solid var(--border)',
    borderRadius: 7,
    background: 'var(--card)',
    color: 'var(--text)',
    fontFamily: 'inherit',
    fontSize: 12.5,
    padding: '0 9px',
    outline: 'none',
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)' }}>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="タイトル" autoFocus style={inputStyle}/>
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="説明"
        rows={2}
        style={{ ...inputStyle, height: 'auto', resize: 'vertical', paddingTop: 8, lineHeight: 1.5 }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} aria-label="開始日" style={inputStyle}/>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} aria-label="終了日" style={inputStyle}/>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} aria-label="開始時刻" style={inputStyle}/>
        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} aria-label="終了時刻" style={inputStyle}/>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={() => { reset(); setOpen(false) }}>キャンセル</button>
        <button type="submit" className="btn btn-primary" disabled={!title.trim()}>作成</button>
      </div>
    </form>
  )
}

const MilestoneRow = ({ milestone, canEdit, onPatch, onDelete }: {
  milestone: MilestoneDto
  canEdit: boolean
  onPatch: (id: string, input: Partial<Pick<MilestoneDto, 'title' | 'description' | 'startDate' | 'endDate' | 'startTime' | 'endTime' | 'completed'>>) => void
  onDelete: (milestone: MilestoneDto) => void
}) => {
  const router = useRouter()
  const overdue = isPastDue(milestone)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/chats/${milestone.channelId}`)}
      onKeyDown={e => { if (e.key === 'Enter') router.push(`/chats/${milestone.channelId}`) }}
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 8,
        padding: 10,
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: milestone.completed ? 'var(--card)' : 'var(--card-2)',
        cursor: 'pointer',
        opacity: milestone.completed ? 0.72 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={milestone.completed}
        disabled={!canEdit}
        onClick={e => e.stopPropagation()}
        onChange={e => onPatch(milestone.id, { completed: e.target.checked })}
        style={{ marginTop: 7, cursor: canEdit ? 'pointer' : 'not-allowed' }}
        aria-label="完了"
      />
      <div style={{ minWidth: 0 }} onClick={e => e.stopPropagation()}>
        <InlineText
          value={milestone.title}
          onSave={v => onPatch(milestone.id, { title: v })}
          placeholder="マイルストーン名"
          required
          readOnly={!canEdit}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: overdue ? 'var(--red-text)' : 'var(--text-3)', fontSize: 11.5, fontWeight: overdue ? 700 : 500 }}>
            <Icon name="calendar" size={11}/>
            <InlineDatePair
              startDate={milestone.startDate}
              endDate={milestone.endDate}
              startTime={milestone.startTime}
              endTime={milestone.endTime}
              onSave={(start, end, startTime, endTime) => onPatch(milestone.id, { startDate: start, endDate: end, startTime, endTime })}
              readOnly={!canEdit}
            />
          </span>
          <button
            type="button"
            onClick={() => router.push(`/chats/${milestone.channelId}`)}
            className="btn btn-ghost"
            style={{ height: 24, fontSize: 11.5, padding: '0 7px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Icon name="chat" size={11}/> スレッド
          </button>
        </div>
        <InlineText
          value={milestone.description ?? ''}
          onSave={v => onPatch(milestone.id, { description: v || null })}
          placeholder="説明を入力…"
          multiline
          readOnly={!canEdit}
        />
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onDelete(milestone) }}
          aria-label="マイルストーンを削除"
          style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer' }}
        >
          <Icon name="trash" size={13}/>
        </button>
      )}
    </div>
  )
}

const MilestoneSection = ({ projectId, canEdit }: { projectId: string; canEdit: boolean }) => {
  const milestones = useProjectMilestones(projectId)
  const [deleteTarget, setDeleteTarget] = React.useState<MilestoneDto | null>(null)

  const handlePatch = (id: string, input: Partial<Pick<MilestoneDto, 'title' | 'description' | 'startDate' | 'endDate' | 'startTime' | 'endTime' | 'completed'>>) => {
    milestones.patchMutation.mutate(
      { id, input },
      { onError: () => toast.error('マイルストーンの更新に失敗しました') },
    )
  }

  return (
    <div style={{ padding: 14, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ ...cardLabelStyle, marginBottom: 0 }}>マイルストーン</div>
        <div style={{ marginLeft: 'auto' }}>
          <MilestoneCreateForm
            disabled={!canEdit || milestones.createMutation.isPending}
            onCreate={input => milestones.createMutation.mutate(input, {
              onSuccess: () => toast.success('マイルストーンを作成しました'),
              onError: () => toast.error('マイルストーンの作成に失敗しました'),
            })}
          />
        </div>
      </div>
      {milestones.isLoading ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-4)' }}>読み込み中...</div>
      ) : milestones.isError ? (
        <div style={{ fontSize: 12.5, color: 'var(--red-text)' }}>マイルストーンの取得に失敗しました</div>
      ) : milestones.data && milestones.data.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {milestones.data.map(m => (
            <MilestoneRow
              key={m.id}
              milestone={m}
              canEdit={canEdit}
              onPatch={handlePatch}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--text-4)', lineHeight: 1.6 }}>
          まだマイルストーンはありません。
        </div>
      )}
      <ConfirmDialog
        open={deleteTarget != null}
        title="マイルストーンを削除"
        message={deleteTarget ? `「${deleteTarget.title}」を削除しますか？このマイルストーンのスレッドの会話もすべて削除されます。この操作は取り消せません。` : ''}
        onConfirm={async () => {
          if (!deleteTarget) return
          await milestones.deleteMutation.mutateAsync(deleteTarget.id)
          toast.success('マイルストーンを削除しました')
        }}
        onClose={() => setDeleteTarget(null)}
      />
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

  // プロジェクト編集は member 以上、削除（アーカイブ含む破壊的操作のうち削除）は admin 以上
  const { isMember: canEdit, isAdmin: canDelete } = useWorkspacePermissions()
  const readOnly = !canEdit

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* タイトル */}
      <InlineText
        value={project.title}
        onSave={v => patch.mutate({ title: v })}
        placeholder="プロジェクト名"
        large
        required
        readOnly={readOnly}
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
            readOnly={readOnly}
          />
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{project.memberCount}人参加</div>
        </div>
        <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
          <div style={cardLabelStyle}>ステータス</div>
          <InlineStatus
            statusName={project.statusName}
            onSave={name => patch.mutate({ statusName: name })}
            readOnly={readOnly}
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
          readOnly={readOnly}
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
          readOnly={readOnly}
        />
      </div>

      <MilestoneSection projectId={project.id} canEdit={canEdit} />

      {/* アーカイブ */}
      <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
        <div style={cardLabelStyle}>アーカイブ</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 8 }}>
          {project.archived
            ? 'このプロジェクトはアーカイブされています。解除するとプロジェクト一覧に再表示されます。'
            : 'アーカイブすると一覧の「アーカイブ」タブに移動します。データは保持されます。'}
        </div>
        <button
          onClick={() => archivePatch.mutate(
            { archived: !project.archived },
            {
              onSuccess: () => toast.success(project.archived ? 'アーカイブを解除しました' : 'アーカイブしました'),
              onError: () => toast.error('操作に失敗しました'),
            },
          )}
          disabled={archivePatch.isPending || !canEdit}
          title={canEdit ? undefined : 'アーカイブの変更にはメンバー以上の権限が必要です'}
          className="btn btn-ghost"
          style={{ height: 30, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, ...(canEdit ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }}
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
          disabled={!canDelete}
          title={canDelete ? undefined : 'プロジェクトの削除には管理者以上の権限が必要です'}
          style={{ width: '100%', padding: '7px 12px', borderRadius: 7, border: '1px solid var(--red)', background: 'transparent', color: 'var(--red-text)', fontSize: 12.5, fontWeight: 600, cursor: canDelete ? 'pointer' : 'not-allowed', opacity: canDelete ? 1 : 0.5, fontFamily: 'inherit' }}
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
