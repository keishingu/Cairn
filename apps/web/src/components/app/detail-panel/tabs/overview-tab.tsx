'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Icon, StatusChip } from '../../primitives'
import { ConfirmDialog } from '../../confirm-dialog'
import { InlineError } from '../../inline-error'
import type { ProjectDto } from '@/app/api/projects/route'
import { LocationInput } from '../../location-input'
import { usePatchProject, useDeleteProject } from '@/hooks/use-patch-project'
import { useProjectMilestones } from '@/hooks/use-project-milestones'
import { useProjectStatuses } from '@/hooks/use-project-statuses'
import { useWorkspacePermissions } from '@/hooks/use-current-user'
import { DATE_ORDER_ERROR, isEndBeforeStart } from '@/lib/date-range'
import { toast } from '@/lib/toast'
import { useT } from '@/components/locale-provider'
import { useCancelEditOnEscape } from '@/hooks/use-cancel-edit-on-escape'
import type { MilestoneDto } from '@/app/api/projects/[id]/milestones/route'
import { useAppShell } from '../../app-shell-context'
import { DateRangeSheet } from '../../mobile/date-range-sheet'
import { CreateMilestoneModal } from '../../pages/create-milestone-modal'


const formatTime = (time: string | null) => time ? time.slice(0, 5) : null

export function formatDateRange(start: string | null, end: string | null, startTime?: string | null, endTime?: string | null): string {
  const fmt = (d: string) => {
    const [, m, day] = d.split('-')
    return `${Number(m)}/${Number(day)}`
  }
  const st = formatTime(startTime ?? null)
  const et = formatTime(endTime ?? null)
  if (!start) return end ? `~ ${fmt(end)}${et ? ` ${et}` : ''}` : '—'
  const startLabel = `${fmt(start)}${st ? ` ${st}` : ''}`
  if (!end || end === start) return et ? `${startLabel} ~ ${et}` : startLabel
  return `${startLabel} ~ ${fmt(end)}${et ? ` ${et}` : ''}`
}

// ─── インライン編集フィールド ─────────────────────────────────────
// テキストは明示保存。保存は保存ボタン / Enter（複数行は Cmd/Ctrl+Enter）、取り消しはキャンセルボタン / Esc。
// フォーカスが外れても保存も破棄もしない（入力中の内容を残したまま編集を続けられる）
export const InlineText = ({
  value, onSave, placeholder, multiline = false, large = false, required = false, readOnly = false,
}: {
  value: string
  /** 保存の成否を返す。reject したら編集を閉じず、入力を残してエラーを表示する */
  onSave: (v: string) => Promise<unknown>
  placeholder?: string
  multiline?: boolean
  large?: boolean
  required?: boolean
  readOnly?: boolean
}) => {
  const t = useT()
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(value)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const trimmed = draft.trim()
  const unchanged = trimmed === value.trim()
  const invalid = required && !trimmed
  const canSave = !saving && !unchanged && !invalid

  const startEdit = () => {
    if (readOnly) return
    setDraft(value)
    setError(null)
    setEditing(true)
  }

  const cancel = () => {
    setEditing(false)
    setDraft(value)
    setError(null)
  }

  const wrapRef = React.useRef<HTMLDivElement>(null)
  useCancelEditOnEscape(wrapRef, editing && !saving, cancel)

  // 保存に失敗して入力欄が再び有効になったとき、フォーカスを戻す（無効化で外れるため。Esc で取り消せるように）
  React.useEffect(() => {
    if (!saving) wrapRef.current?.querySelector<HTMLElement>('input, textarea')?.focus()
  }, [saving])

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      await onSave(trimmed)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t('Could not save the changes'))
    } finally {
      setSaving(false)
    }
  }

  const fontSize = large ? 15 : 13
  const fontWeight = large ? 600 : 400

  if (!editing) {
    const empty = value === ''
    return (
      <>
      <button
        type="button"
        disabled={readOnly}
        onClick={startEdit}
        title={readOnly ? undefined : t('Click to edit')}
        style={{
          display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit',
          background: 'transparent', border: '1px solid transparent', borderRadius: 7,
          color: empty ? 'var(--text-4)' : 'var(--text)', fontSize, fontWeight, lineHeight: 1.55,
          padding: '4px 2px', boxSizing: 'border-box', cursor: readOnly ? 'default' : 'pointer',
          whiteSpace: multiline ? 'pre-wrap' : 'normal', overflowWrap: 'anywhere',
          minHeight: multiline ? 28 : undefined,
        }}
      >
        {empty ? (placeholder ?? '') : value}
      </button>
      </>
    )
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', fontFamily: 'inherit', outline: 'none',
    background: 'var(--card)', border: '1px solid var(--accent)', borderRadius: 7,
    color: 'var(--text)', fontSize, fontWeight, padding: '6px 8px', lineHeight: 1.55,
    resize: 'none', boxSizing: 'border-box',
  }

  return (
    <div ref={wrapRef} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {multiline ? (
        <textarea
          value={draft}
          placeholder={placeholder}
          rows={3}
          disabled={saving}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          style={{ ...fieldStyle, minHeight: 64 }}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void save()
            }
          }}
        />
      ) : (
        <input
          type="text"
          value={draft}
          placeholder={placeholder}
          disabled={saving}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          style={fieldStyle}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void save()
            }
          }}
        />
      )}
      {error && <InlineError style={{ fontSize: 'var(--fs-sm)' }}>{error}</InlineError>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button type="button" className="btn btn-sm" onClick={cancel} disabled={saving}>{t('Cancel')}</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} disabled={!canSave}>
          {saving ? t('Saving…') : t('Save')}
        </button>
      </div>
    </div>
  )
}

export const InlineDatePair = ({
  startDate, endDate, startTime = null, endTime = null, onSave, readOnly = false, withTime = true, sheetSubtitle,
}: {
  startDate: string | null
  endDate: string | null
  startTime?: string | null
  endTime?: string | null
  onSave: (start: string | null, end: string | null, startTime: string | null, endTime: string | null) => unknown
  readOnly?: boolean
  /** 時刻も編集する。プロジェクトは日付しか保存しないため false にし、入れても消える時刻欄を出さない */
  withTime?: boolean
  /** モバイルの日程シートの見出しの下に出す対象名 */
  sheetSubtitle?: string
}) => {
  const t = useT()
  const { isMobile } = useAppShell()
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [start, setStart] = React.useState(startDate ?? '')
  const [end, setEnd]     = React.useState(endDate ?? '')
  const [startClock, setStartClock] = React.useState(formatTime(startTime) ?? '')
  const [endClock, setEndClock] = React.useState(formatTime(endTime) ?? '')

  // 編集中は入力を守り、外部の更新で上書きしない
  React.useEffect(() => {
    if (editing) return
    setStart(startDate ?? '')
    setEnd(endDate ?? '')
    setStartClock(formatTime(startTime) ?? '')
    setEndClock(formatTime(endTime) ?? '')
  }, [editing, startDate, endDate, startTime, endTime])

  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const reversed = isEndBeforeStart(start, end)
  const dateErrorId = React.useId()

  const unchanged =
    (start || null) === startDate && (end || null) === endDate &&
    (startClock || null) === formatTime(startTime) && (endClock || null) === formatTime(endTime)

  const reset = () => {
    setStart(startDate ?? '')
    setEnd(endDate ?? '')
    setStartClock(formatTime(startTime) ?? '')
    setEndClock(formatTime(endTime) ?? '')
    setError(null)
  }

  const startEdit = () => {
    if (readOnly) return
    reset()
    setEditing(true)
  }

  // 確定は完了ボタン / Enter だけ。フォーカス移動や外側の押下では確定も破棄もしない
  // （スマホのネイティブピッカーを閉じると移動先のない blur が来るため、blur で動かすと終了日に触れる前に閉じてしまう）
  const commit = async () => {
    // 逆転した期間は保存できないので、閉じずにその場で直してもらう（やめる時はキャンセル / Esc）
    if (saving || reversed) return
    if (unchanged) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(start || null, end || null, startClock || null, endClock || null)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t('Could not save the changes'))
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    setEditing(false)
    reset()
  }

  // Esc は編集の取り消しだけにして、周りのパネルは閉じない
  const wrapRef = React.useRef<HTMLDivElement>(null)
  useCancelEditOnEscape(wrapRef, editing && !saving, cancel)
  // 保存に失敗して入力欄が再び有効になったとき、フォーカスを戻す（無効化で外れるため。Esc で取り消せるように）
  React.useEffect(() => {
    if (!saving) wrapRef.current?.querySelector<HTMLElement>('input, textarea')?.focus()
  }, [saving])


  // タッチ端末では押しやすい高さにし、iOS が 16px 未満の入力欄をフォーカス時に拡大するのを避ける
  const [coarse, setCoarse] = React.useState(false)
  React.useEffect(() => {
    setCoarse(window.matchMedia?.('(pointer: coarse)').matches ?? false)
  }, [])

  const inputStyle: React.CSSProperties = {
    height: coarse ? 40 : 30, padding: coarse ? '0 6px' : '0 8px', borderRadius: 6, minWidth: 0, boxSizing: 'border-box',
    border: '1px solid var(--border)', background: 'var(--card)',
    color: 'var(--text)', fontSize: coarse ? 'var(--fs-xl)' : 'var(--fs-md)', fontFamily: 'inherit', outline: 'none',
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void commit() }
  }

  // モバイルはインライン編集をやめ、カレンダーで選んで「保存」で確定するシートを開く。
  // ネイティブの日付ピッカーは値の確定前にフォーカスが外れ、外側タップでの自動確定と噛み合わず変更が失われるため
  if (isMobile || !editing) {
    return (
      <>
      <button
        type="button"
        onClick={() => {
          if (readOnly) return
          if (isMobile) { setSheetOpen(true); return }
          startEdit()
        }}
        disabled={readOnly}
        style={{
          display: 'inline-flex', alignItems: 'baseline', gap: 4,
          padding: '2px 0', border: 'none',
          background: 'transparent', cursor: readOnly ? 'default' : 'pointer', fontFamily: 'inherit',
        }}
        title={readOnly ? undefined : t('Click to edit')}
      >
        <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--text)' }}>
          {formatDateRange(startDate, endDate, startTime, endTime)}
        </span>
        {!readOnly && <Icon name="edit" size={10} color="var(--text-4)"/>}
      </button>
      {sheetOpen && (
        <DateRangeSheet
          title={t('Dates')}
          subtitle={sheetSubtitle}
          startDate={startDate}
          endDate={endDate}
          startTime={startTime}
          endTime={endTime}
          withTime={withTime}
          onSave={onSave}
          onClose={() => setSheetOpen(false)}
        />
      )}
      </>
    )
  }

  const dateStyle: React.CSSProperties = { ...inputStyle, flex: '1 1 132px' }
  const timeStyle: React.CSSProperties = { ...inputStyle, flex: '1 1 96px' }
  const rowStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4 }

  // 開始と終了を別の行に分ける。スマホの概要カードは日付1つ分の幅しかなく、
  // 4つを1列に流すとどれが終了日か分からなくなる
  return (
    <div
      ref={wrapRef}
      style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 300 }}
    >
      <div style={rowStyle}>
        <input
          type="date"
          value={start}
          autoFocus
          aria-label={t('Start date')}
          disabled={saving}
          onChange={e => setStart(e.target.value)}
          onKeyDown={handleKeyDown}
          style={dateStyle}
        />
        {withTime && <input
          type="time"
          value={startClock}
          aria-label={t('Start time')}
          disabled={saving}
          onChange={e => setStartClock(e.target.value)}
          onKeyDown={handleKeyDown}
          style={timeStyle}
        />}
      </div>
      <span style={{ color: 'var(--text-4)', fontSize: 'var(--fs-sm)', lineHeight: 1 }}>{t('to')}</span>
      <div style={rowStyle}>
        <input
          type="date"
          value={end}
          // ピッカー側でも開始日より前を選びにくくする（手入力や開始日の変更では超えられるので、下でも判定する）
          min={start || undefined}
          aria-label={t('End date')}
          disabled={saving}
          aria-invalid={reversed}
          aria-describedby={reversed ? dateErrorId : undefined}
          onChange={e => setEnd(e.target.value)}
          onKeyDown={handleKeyDown}
          style={reversed ? { ...dateStyle, border: '1px solid var(--red)' } : dateStyle}
        />
        {withTime && <input
          type="time"
          value={endClock}
          aria-label={t('End time')}
          disabled={saving}
          onChange={e => setEndClock(e.target.value)}
          onKeyDown={handleKeyDown}
          style={timeStyle}
        />}
      </div>
      {reversed && (
        // 終了日の入力欄から参照できるよう id を持つ要素で包む
        <div id={dateErrorId}>
          <InlineError style={{ fontSize: 'var(--fs-sm)' }}>{t('End date must be on or after the start date')}</InlineError>
        </div>
      )}
      {error && <InlineError style={{ fontSize: 'var(--fs-sm)' }}>{error}</InlineError>}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, marginTop: 2 }}>
        {/* 逆転している間は確定できないため、キーボードの無い端末でも編集をやめられるようにする */}
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          style={{
            // スマホの概要カード（幅 140px ほど）で「キャンセル」と「完了」が1行に収まる余白にする
            height: coarse ? 36 : 26, padding: '0 8px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)',
            fontSize: coarse ? 'var(--fs-lg)' : 'var(--fs-sm)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          {t('Cancel')}
        </button>
        <button
          type="button"
          onClick={() => void commit()}
          disabled={reversed || saving}
          style={{
            height: coarse ? 36 : 26, padding: '0 8px', borderRadius: 6, border: 'none',
            background: 'var(--accent)', color: 'var(--on-accent)',
            fontSize: coarse ? 'var(--fs-lg)' : 'var(--fs-sm)', fontWeight: 600, fontFamily: 'inherit',
            cursor: reversed || saving ? 'default' : 'pointer', opacity: reversed || saving ? 0.5 : 1,
          }}
        >
          {t('Done')}
        </button>
      </div>
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
  const t = useT()
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
        title={readOnly ? undefined : t('Click to change')}
      >
        <StatusChip name={statusName ?? '—'} color={statuses.find(s => s.name === statusName)?.color ?? '#9CA3AF'}/>
        {!readOnly && <Icon name="chevDown" size={11} color="var(--text-4)"/>}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 'var(--z-dropdown)',
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
                color: 'var(--text)', fontSize: 'var(--fs-md)', fontFamily: 'inherit',
                cursor: 'pointer', borderRadius: 6,
                fontWeight: s.name === statusName ? 600 : 400,
              }}
              className="hover-bg"
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
  const t = useT()
  const [editing, setEditing] = React.useState(false)

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 34, padding: '0 12px',
    border: '1px solid var(--accent)', borderRadius: 7,
    background: 'var(--card)', color: 'var(--text)',
    fontSize: 'var(--fs-md)', fontFamily: 'inherit', outline: 'none',
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
        title={readOnly ? undefined : t('Click to edit')}
      >
        <Icon name="map-pin" size={12} color={location ? 'var(--accent-text)' : 'var(--text-4)'}/>
        <span style={{ fontSize: 'var(--fs-md)', color: location ? 'var(--text)' : 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {location ?? (readOnly ? t('Not set') : t('Set a location…'))}
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
        placeholder={t('Search for a place…')}
      />
      <button
        onClick={() => setEditing(false)}
        className="btn btn-ghost"
        style={{ alignSelf: 'flex-start', height: 26, fontSize: 'var(--fs-sm)', padding: '0 8px' }}
      >
        {t('Cancel')}
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

const MilestoneRow = ({ milestone, canEdit, onPatch, onDelete }: {
  milestone: MilestoneDto
  canEdit: boolean
  onPatch: (id: string, input: Partial<Pick<MilestoneDto, 'title' | 'description' | 'startDate' | 'endDate' | 'startTime' | 'endTime' | 'completed'>>) => Promise<unknown>
  onDelete: (milestone: MilestoneDto) => void
}) => {
  const t = useT()
  const router = useRouter()
  const overdue = isPastDue(milestone)
  const goToThread = () => router.push(`/chats/${milestone.channelId}`)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={goToThread}
      onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) goToThread() }}
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
        onChange={e => {
          onPatch(milestone.id, { completed: e.target.checked }).catch((err: unknown) => {
            toast.error(err instanceof Error ? err.message : t('Could not update this milestone'))
          })
        }}
        style={{ marginTop: 7, cursor: canEdit ? 'pointer' : 'not-allowed' }}
        aria-label={t('Complete')}
      />
      <div style={{ minWidth: 0 }} onClick={e => e.stopPropagation()}>
        <InlineText
          value={milestone.title}
          onSave={v => onPatch(milestone.id, { title: v })}
          placeholder={t('Milestone name')}
          required
          readOnly={!canEdit}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: overdue ? 'var(--red-text)' : 'var(--text-3)', fontSize: 'var(--fs-sm)', fontWeight: overdue ? 600 : 500 }}>
            <Icon name="calendar" size={11}/>
            <InlineDatePair
              startDate={milestone.startDate}
              endDate={milestone.endDate}
              startTime={milestone.startTime}
              endTime={milestone.endTime}
              onSave={(start, end, startTime, endTime) => onPatch(milestone.id, { startDate: start, endDate: end, startTime, endTime })}
              readOnly={!canEdit}
              sheetSubtitle={milestone.title}
            />
          </span>
          <button
            type="button"
            onClick={goToThread}
            className="btn btn-ghost"
            style={{ height: 24, fontSize: 'var(--fs-sm)', padding: '0 7px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Icon name="chat" size={11}/> {t('Thread')}
          </button>
        </div>
        <InlineText
          value={milestone.description ?? ''}
          onSave={v => onPatch(milestone.id, { description: v || null })}
          placeholder={t('Enter a description…')}
          multiline
          readOnly={!canEdit}
        />
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onDelete(milestone) }}
          aria-label={t('Delete milestone')}
          style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer' }}
        >
          <Icon name="trash" size={13}/>
        </button>
      )}
    </div>
  )
}

export const MilestoneSection = ({ projectId, projectTitle, canEdit, projectStartDate = null }: { projectId: string; projectTitle: string; canEdit: boolean; projectStartDate?: string | null }) => {
  const t = useT()
  const milestones = useProjectMilestones(projectId)
  const [deleteTarget, setDeleteTarget] = React.useState<MilestoneDto | null>(null)
  const [creating, setCreating] = React.useState(false)

  // API のエラー文は日本語固定で、通信失敗ではブラウザの英語文も来る。そのまま出すと表示言語と食い違うため、
  // 見分けられる理由（期間の逆転）だけを翻訳済みの文言に置き換え、それ以外は画面側の汎用文言にする。
  // 入力欄でも止めているので、ここに来るのは他の人の更新と重なって保存済みの値が変わった時だけ
  const milestoneErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error && error.message === DATE_ORDER_ERROR
      ? t('End date must be on or after the start date')
      : fallback

  // 失敗はトーストで通知したうえで reject し直し、呼び出し側（インライン編集欄）が下書きを残せるようにする
  // 失敗は翻訳済みの文言で reject する。インライン編集欄はそれを1回だけ表示し（トーストは重ねない）、
  // 編集欄を持たない完了チェックだけが呼び出し側でトーストにする
  const handlePatch = (id: string, input: Partial<Pick<MilestoneDto, 'title' | 'description' | 'startDate' | 'endDate' | 'startTime' | 'endTime' | 'completed'>>) =>
    milestones.patchMutation.mutateAsync({ id, input }).catch((error: unknown) => {
      throw new Error(milestoneErrorMessage(error, t('Could not update this milestone')))
    })

  return (
    <div style={{ padding: 14, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div className="section-label">{t('Milestones')}</div>
        {/* チャットからの作成と同じフォーム（PC はモーダル、モバイルはボトムシート）を開く */}
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={!canEdit}
          className="btn btn-ghost"
          style={{ marginLeft: 'auto', height: 30, fontSize: 'var(--fs-sm)', display: 'inline-flex', alignItems: 'center', gap: 5, ...(!canEdit ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
        >
          <Icon name="plus" size={12}/> {t('Add')}
        </button>
      </div>
      {creating && (
        <CreateMilestoneModal
          projectId={projectId}
          projectTitle={projectTitle}
          defaultMonth={projectStartDate}
          onClose={() => setCreating(false)}
          onCreated={() => toast.success(t('Milestone created'))}
        />
      )}
      {milestones.isLoading ? (
        <div style={{ fontSize: 'var(--fs-md)', color: 'var(--text-4)' }}>{t('Loading…')}</div>
      ) : milestones.isError ? (
        <div style={{ fontSize: 'var(--fs-md)', color: 'var(--red-text)' }}>{t('Could not load milestones')}</div>
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
        <div style={{ fontSize: 'var(--fs-md)', color: 'var(--text-4)', lineHeight: 1.6 }}>
          {t('No milestones yet.')}
        </div>
      )}
      <ConfirmDialog
        open={deleteTarget != null}
        title={t('Delete milestone')}
        message={deleteTarget ? t('Delete "{name}"? This also deletes every message in the milestone thread. This cannot be undone.', { name: deleteTarget.title }) : ''}
        onConfirm={async () => {
          if (!deleteTarget) return
          await milestones.deleteMutation.mutateAsync(deleteTarget.id)
          toast.success(t('Milestone deleted'))
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
  const t = useT()
  // 即保存の項目（ステータス・場所）用。失敗はタイトル下のエラー欄に出す
  const patch = usePatchProject(project.id)
  // 明示保存の編集欄（タイトル・日程・概要）用。失敗は各編集欄が自分で表示するので、共有のエラー欄とは分ける
  const editPatch = usePatchProject(project.id)
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
        onSave={v => editPatch.mutateAsync({ title: v })}
        placeholder={t('Project name')}
        large
        required
        readOnly={readOnly}
      />

      {patch.isError && (
        <InlineError style={{ fontSize: 'var(--fs-sm)', marginTop: -10 }}>{(patch.error as Error).message}</InlineError>
      )}

      {/* 日程 + ステータス */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
          <div className="section-label" style={{ marginBottom: 4 }}>{t('Dates')}</div>
          <InlineDatePair
            startDate={project.startDate}
            endDate={project.endDate}
            onSave={(start, end) => editPatch.mutateAsync({ startDate: start, endDate: end })}
            readOnly={readOnly}
            withTime={false}
            sheetSubtitle={project.title}
          />
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-3)', marginTop: 4 }}>{t('{count} joined', { count: project.memberCount })}</div>
        </div>
        <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
          <div className="section-label" style={{ marginBottom: 4 }}>{t('Status')}</div>
          <InlineStatus
            statusName={project.statusName}
            onSave={name => patch.mutate({ statusName: name })}
            readOnly={readOnly}
          />
        </div>
      </div>

      {/* 場所 */}
      <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
        <div className="section-label" style={{ marginBottom: 4 }}>{t('Location')}</div>
        <InlineLocation
          location={project.location}
          onSave={(desc, pid) => patch.mutate({ location: desc, placeId: pid })}
          onClear={() => patch.mutate({ location: null, placeId: null })}
          readOnly={readOnly}
        />
      </div>

      {/* サマリー */}
      <div style={{ padding: 14, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
        <div className="section-label" style={{ marginBottom: 4 }}>{t('Summary')}</div>
        <InlineText
          value={project.description ?? ''}
          onSave={v => editPatch.mutateAsync({ description: v || null })}
          placeholder={t('Click to enter a summary or goals…')}
          multiline
          readOnly={readOnly}
        />
      </div>

      <MilestoneSection projectStartDate={project.startDate} projectId={project.id} projectTitle={project.title} canEdit={canEdit} />

      {/* アーカイブ */}
      <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
        <div className="section-label" style={{ marginBottom: 4 }}>{t('Archive')}</div>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 8 }}>
          {project.archived
            ? t('This project is archived. Unarchiving shows it in the project list again.')
            : t('Archiving moves it to the Archive tab. Data is kept.')}
        </div>
        <button
          onClick={() => archivePatch.mutate(
            { archived: !project.archived },
            {
              onSuccess: () => toast.success(project.archived ? t('Project unarchived') : t('Project archived')),
              onError: () => toast.error(t('The action failed')),
            },
          )}
          disabled={archivePatch.isPending || !canEdit}
          title={canEdit ? undefined : t('Changing the archive requires member access or higher')}
          className="btn btn-ghost"
          style={{ height: 30, fontSize: 'var(--fs-sm)', display: 'inline-flex', alignItems: 'center', gap: 5, ...(canEdit ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }}
        >
          <Icon name={project.archived ? 'refresh' : 'archive'} size={13}/>
          {archivePatch.isPending ? t('Working...') : project.archived ? t('Unarchive') : t('Archive project')}
        </button>
      </div>

      {/* 削除 */}
      <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
        <div className="section-label" style={{ marginBottom: 4 }}>{t('Delete')}</div>
        <button
          onClick={() => setConfirmDelete(true)}
          disabled={!canDelete}
          title={canDelete ? undefined : t('Deleting a project requires admin access or higher')}
          style={{ width: '100%', padding: '7px 12px', borderRadius: 7, border: '1px solid var(--red)', background: 'transparent', color: 'var(--red-text)', fontSize: 'var(--fs-md)', fontWeight: 600, cursor: canDelete ? 'pointer' : 'not-allowed', opacity: canDelete ? 1 : 0.5, fontFamily: 'inherit' }}
        >
          {t('Delete this project')}
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={t('Delete project')}
        message={t('Delete "{name}"? Chat, files, tasks, and all other data will be permanently deleted. This cannot be undone.', { name: project.title })}
        onConfirm={async () => {
          await deleteMutation.mutateAsync()
          onDeleted()
        }}
        onClose={() => setConfirmDelete(false)}
      />

    </div>
  )
}
