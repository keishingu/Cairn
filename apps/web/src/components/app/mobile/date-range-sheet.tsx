'use client'

import React from 'react'
import { Icon, sheetFieldInputStyle, sheetFieldLabelStyle } from '../primitives'
import { useLocale, useT } from '@/components/locale-provider'
import { MobileFormSheet } from './form-sheet'
import {
  applyDateTap, buildMonthGrid, isInRange, parseIsoDate, shiftMonth, toIsoDate,
  type RangeSelection, type RangeTarget,
} from './date-range-calendar'

export interface DateRangeValue {
  start: string | null
  end: string | null
  startTime: string
  endTime: string
}

function todayIso(): string {
  const d = new Date()
  return toIsoDate(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * 開始・終了をカレンダーで選ぶ部品（モバイルのシートの中身）。開始/終了のどちらを選ぶかを明示して切り替え、
 * 終了だけ直す時に開始が消えないようにする。逆転した期間は選べない（applyDateTap が開始として扱う）
 */
export function DateRangePicker({ value, onChange, withTime = false, defaultMonth = null }: {
  value: DateRangeValue
  onChange: (next: DateRangeValue) => void
  withTime?: boolean
  /** 日付が未設定の時に最初に開く月（YYYY-MM-DD）。未指定なら今月 */
  defaultMonth?: string | null
}) {
  const t = useT()
  const { locale } = useLocale()
  const [target, setTarget] = React.useState<RangeTarget>('start')
  const [view, setView] = React.useState(() => {
    const base = parseIsoDate(value.start ?? value.end ?? defaultMonth ?? todayIso())
    return { year: base.year, monthIndex: base.monthIndex }
  })
  const startTimeId = React.useId()
  const endTimeId = React.useId()

  const today = todayIso()
  const cells = buildMonthGrid(view.year, view.monthIndex)
  const monthLabel = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(new Date(view.year, view.monthIndex, 1))
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(2026, 0, 4 + i)), // 2026-01-04 は日曜
  )
  const formatDay = (iso: string | null) => {
    if (!iso) return t('Not set')
    const { year, monthIndex, day } = parseIsoDate(iso)
    return new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(year, monthIndex, day))
  }

  const selectTarget = (next: RangeTarget) => {
    setTarget(next)
    const iso = next === 'start' ? value.start : value.end
    if (iso) {
      const { year, monthIndex } = parseIsoDate(iso)
      setView({ year, monthIndex })
    }
  }

  const tapDate = (iso: string) => {
    const next: RangeSelection = applyDateTap({ start: value.start, end: value.end, target }, iso)
    setTarget(next.target)
    onChange({ ...value, start: next.start, end: next.end })
  }

  const targetButton = (key: RangeTarget, label: string, iso: string | null) => {
    const active = target === key
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => selectTarget(key)}
        style={{
          flex: 1, minWidth: 0, textAlign: 'left', padding: '8px 12px', borderRadius: 10,
          border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
          background: active ? 'var(--accent-soft)' : 'var(--card-2)',
          fontFamily: 'inherit', cursor: 'pointer',
        }}
      >
        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: active ? 'var(--accent-text)' : 'var(--text-3)' }}>{label}</div>
        <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, color: iso ? 'var(--text)' : 'var(--text-4)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {formatDay(iso)}
        </div>
      </button>
    )
  }

  const navButtonStyle: React.CSSProperties = {
    width: 40, height: 40, borderRadius: 10, border: 'none', background: 'var(--card-2)', color: 'var(--text-2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        {targetButton('start', t('Start date'), value.start)}
        {targetButton('end', t('End date'), value.end)}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button type="button" aria-label={t('Previous month')} onClick={() => setView(v => shiftMonth(v.year, v.monthIndex, -1))} style={navButtonStyle}>
            <Icon name="chevLeft" size={18}/>
          </button>
          <div aria-live="polite" style={{ flex: 1, textAlign: 'center', fontSize: 'var(--fs-xl)', fontWeight: 600, color: 'var(--text)' }}>{monthLabel}</div>
          <button type="button" aria-label={t('Next month')} onClick={() => setView(v => shiftMonth(v.year, v.monthIndex, 1))} style={navButtonStyle}>
            <Icon name="chevRight" size={18}/>
          </button>
        </div>

        <div role="grid" aria-label={monthLabel} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', rowGap: 2 }}>
          {weekdayLabels.map((w, i) => (
            <div key={`w${i}`} role="columnheader" style={{ textAlign: 'center', fontSize: 'var(--fs-sm)', fontWeight: 600, color: i === 0 ? 'var(--red-text)' : 'var(--text-4)', padding: '4px 0' }}>{w}</div>
          ))}
          {cells.map((iso, i) => {
            if (!iso) return <div key={`e${i}`}/>
            const isStart = iso === value.start
            const isEnd = iso === value.end
            const edge = isStart || isEnd
            const hasRange = !!value.start && !!value.end && value.start !== value.end
            const inBand = isInRange(iso, value.start, value.end) || (hasRange && edge)
            return (
              <div
                key={iso}
                style={{
                  height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  // 開始〜終了の帯。端の日と週の端は丸めて、選択した丸と繋げる
                  background: inBand ? 'var(--accent-soft)' : 'transparent',
                  borderTopLeftRadius: isStart || i % 7 === 0 ? 22 : 0,
                  borderBottomLeftRadius: isStart || i % 7 === 0 ? 22 : 0,
                  borderTopRightRadius: isEnd || i % 7 === 6 ? 22 : 0,
                  borderBottomRightRadius: isEnd || i % 7 === 6 ? 22 : 0,
                }}
              >
                <button
                  type="button"
                  role="gridcell"
                  aria-selected={edge}
                  aria-label={formatDay(iso)}
                  onClick={() => tapDate(iso)}
                  style={{
                    width: 40, height: 40, borderRadius: '50%', padding: 0,
                    border: iso === today && !edge ? '1px solid var(--accent)' : 'none',
                    background: edge ? 'var(--accent)' : 'transparent',
                    color: edge ? 'var(--on-accent)' : 'var(--text)',
                    fontSize: 'var(--fs-xl)', fontWeight: edge ? 600 : 500, fontFamily: 'inherit', cursor: 'pointer',
                    touchAction: 'manipulation',
                  }}
                >
                  {parseIsoDate(iso).day}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {withTime && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <label htmlFor={startTimeId} style={sheetFieldLabelStyle}>{t('Start time')}</label>
            <input id={startTimeId} type="time" value={value.startTime} onChange={e => onChange({ ...value, startTime: e.target.value })} style={sheetFieldInputStyle(false)}/>
          </div>
          <div style={{ minWidth: 0 }}>
            <label htmlFor={endTimeId} style={sheetFieldLabelStyle}>{t('End time')}</label>
            <input id={endTimeId} type="time" value={value.endTime} onChange={e => onChange({ ...value, endTime: e.target.value })} style={sheetFieldInputStyle(false)}/>
          </div>
        </div>
      )}

      {(value.start || value.end || value.startTime || value.endTime) && (
        <button
          type="button"
          onClick={() => { setTarget('start'); onChange({ start: null, end: null, startTime: '', endTime: '' }) }}
          className="btn btn-ghost"
          style={{ alignSelf: 'flex-start', height: 36, fontSize: 'var(--fs-lg)' }}
        >
          {t('Clear dates')}
        </button>
      )}
    </>
  )
}

interface DateRangeSheetProps {
  title: string
  subtitle?: string | undefined
  startDate: string | null
  endDate: string | null
  startTime?: string | null
  endTime?: string | null
  /** 時刻も編集する（マイルストーン）。プロジェクトは日付だけを保存するため出さない */
  withTime?: boolean
  /** 保存の成否を返す。reject したらシートを閉じず、選んだ日付を残してエラーを表示する */
  onSave: (start: string | null, end: string | null, startTime: string | null, endTime: string | null) => unknown
  onClose: () => void
}

/**
 * モバイルの日程編集シート。iOS のネイティブ日付ピッカーは選んだ値が確定する前にフォーカスが外れ、
 * 自動保存と組み合わせると変更が失われるため、自前のカレンダーで選び「保存」でだけ確定する。
 */
export function DateRangeSheet({
  title, subtitle, startDate, endDate, startTime = null, endTime = null, withTime = false, onSave, onClose,
}: DateRangeSheetProps) {
  const t = useT()
  const initialStartTime = startTime?.slice(0, 5) ?? ''
  const initialEndTime = endTime?.slice(0, 5) ?? ''
  const [value, setValue] = React.useState<DateRangeValue>({ start: startDate, end: endDate, startTime: initialStartTime, endTime: initialEndTime })

  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    // 終了を選ばなければ開始日だけの予定として保存する（表示も開始日だけになる）
    const nst = withTime ? (value.startTime || null) : (startTime ?? null)
    const net = withTime ? (value.endTime || null) : (endTime ?? null)
    if (value.start !== startDate || value.end !== endDate || (withTime && (value.startTime !== initialStartTime || value.endTime !== initialEndTime))) {
      setSaving(true)
      setError(null)
      try {
        await onSave(value.start, value.end, nst, net)
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : t('Could not save the changes'))
        setSaving(false)
        return
      }
      setSaving(false)
    }
    onClose()
  }

  return (
    <MobileFormSheet
      icon="calendar"
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={t('Save')}
      submittingLabel={t('Saving…')}
      isSubmitting={saving}
      disableClose={saving}
      errorMessage={error ?? undefined}
    >
      {/* 保存中は入力を無効にする（fieldset の disabled は中のボタン・入力にまとめて効く） */}
      <fieldset disabled={saving} style={{ display: 'contents', border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
        <DateRangePicker value={value} onChange={setValue} withTime={withTime}/>
      </fieldset>
    </MobileFormSheet>
  )
}
