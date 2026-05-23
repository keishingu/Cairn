'use client'

import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { chatQueryKeys } from '@/lib/chat/client'
import { Icon, AvatarStack, StatusChip, MountainPhoto } from '../primitives'
import { STATUS, type StatusKey } from '../data'
import type { ProjectDto } from '@/app/api/projects/route'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'
import { MobileHeader } from '../mobile/header'
import { CreateProjectSheet } from '../mobile/create-project-sheet'
import { ProjectPanel } from '../detail-panel/project-panel'

// ─── Tag presets ──────────────────────────────────────────────────
const TAG_PRESETS = [
  { id: 't1',  name: '縦走',         color: 'var(--blue)' },
  { id: 't2',  name: '日帰り',       color: 'var(--emerald)' },
  { id: 't3',  name: '雪山',         color: 'var(--violet)' },
  { id: 't4',  name: '沢登り',       color: 'var(--blue)' },
  { id: 't5',  name: 'クライミング', color: 'var(--amber)' },
  { id: 't6',  name: 'テント泊',     color: 'var(--rose)' },
  { id: 't7',  name: '合宿',         color: 'var(--violet)' },
  { id: 't8',  name: '講習会',       color: 'var(--amber)' },
  { id: 't9',  name: '初心者向け',   color: 'var(--emerald)' },
  { id: 't10', name: 'OB合同',       color: 'var(--text-3)' },
  { id: 't11', name: '装備強化',     color: 'var(--text-3)' },
  { id: 't12', name: '危険度: 高',   color: 'var(--red)' },
] as const

const STATUS_ORDER: StatusKey[] = ['plan', 'review', 'wait', 'doing', 'retro', 'done']

// ─── Form atoms ───────────────────────────────────────────────────
interface FieldProps {
  label: string
  hint?: string
  required?: boolean
  error?: string | undefined
  htmlFor?: string
  children: React.ReactNode
}

const Field = ({ label, hint, required, error, children, htmlFor }: FieldProps) => (
  <label htmlFor={htmlFor} style={{ display: 'block' }}>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.01em' }}>
        {label}
        {required && <span style={{ color: 'var(--red)', marginLeft: 4 }}>*</span>}
      </span>
      {hint && <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{hint}</span>}
    </div>
    {children}
    {error && (
      <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--red-text)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 13, height: 13, borderRadius: '50%', background: 'var(--red)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>!</span>
        {error}
      </div>
    )}
  </label>
)

function fieldInputStyle(invalid: boolean): React.CSSProperties {
  return {
    width: '100%', height: 36, padding: '0 12px',
    border: `1px solid ${invalid ? 'var(--red)' : 'var(--border)'}`,
    borderRadius: 8, background: 'var(--card)', color: 'var(--text)',
    fontSize: 13, fontFamily: 'inherit', outline: 'none',
    transition: 'border-color .12s, box-shadow .12s',
    boxSizing: 'border-box',
  }
}

function fieldTextareaStyle(invalid: boolean): React.CSSProperties {
  return { ...fieldInputStyle(invalid), height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.55, minHeight: 80 }
}

function onFocusRing(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = 'var(--accent)'
  e.currentTarget.style.boxShadow = 'var(--ring)'
}

function onBlurRing(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>, invalid: boolean) {
  e.currentTarget.style.borderColor = invalid ? 'var(--red)' : 'var(--border)'
  e.currentTarget.style.boxShadow = 'none'
}

// ─── Status chip selector ─────────────────────────────────────────
interface StatusChipSelectorProps {
  value: StatusKey
  onChange: (v: StatusKey) => void
}

const StatusChipSelector = ({ value, onChange }: StatusChipSelectorProps) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
    {STATUS_ORDER.map(s => {
      const cfg = STATUS[s]
      const selected = value === s
      return (
        <button key={s} type="button" onClick={() => onChange(s)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 12px', borderRadius: 999,
          border: `1.5px solid ${selected ? cfg.dot : 'var(--border)'}`,
          background: selected ? cfg.bg : 'var(--card)',
          color: selected ? cfg.fg : 'var(--text-2)',
          fontSize: 12, fontWeight: selected ? 700 : 500,
          fontFamily: 'inherit', cursor: 'pointer',
          transition: 'background .12s, border-color .12s',
        }}
          onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
          onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'var(--card)' }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot }}/>
          {cfg.label}
        </button>
      )
    })}
  </div>
)

// ─── Cover photo picker ───────────────────────────────────────────
interface CoverPickerProps {
  value: number
  onChange: (v: number) => void
}

const CoverPicker = ({ value, onChange }: CoverPickerProps) => (
  <div style={{ position: 'relative' }}>
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', overflowY: 'hidden', padding: '2px 2px 8px', scrollbarWidth: 'thin' }}>
      {Array.from({ length: 12 }).map((_, i) => {
        const selected = value === i
        return (
          <button key={i} type="button" onClick={() => onChange(i)} style={{
            flexShrink: 0, width: 96, height: 64, padding: 0,
            borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
            border: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
            outline: selected ? 'none' : '1px solid var(--border)',
            outlineOffset: -1,
            background: 'transparent', position: 'relative',
            transition: 'transform .1s, border-color .12s',
            transform: selected ? 'scale(1.02)' : 'scale(1)',
          }}>
            <MountainPhoto idx={i} height={60} flat radius={6}/>
            {selected && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(180deg, rgba(16,185,129,0) 0%, rgba(16,185,129,0.45) 100%)',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
                padding: 5,
              }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="check" size={11} strokeWidth={3}/>
                </span>
              </div>
            )}
          </button>
        )
      })}
    </div>
    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 8, width: 28, background: 'linear-gradient(90deg, transparent, var(--card-2))', pointerEvents: 'none' }}/>
  </div>
)

// ─── Tag picker ───────────────────────────────────────────────────
interface TagPreset {
  id: string
  name: string
  color: string
}

interface TagPickerProps {
  value: string[]
  onChange: (v: string[]) => void
  available?: readonly TagPreset[]
}

const TagPicker = ({ value, onChange, available = TAG_PRESETS }: TagPickerProps) => {
  const [open, setOpen] = React.useState(false)
  const selectedTags = available.filter(t => value.includes(t.id))
  const unselected   = available.filter(t => !value.includes(t.id))
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 36, padding: '5px 6px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)' }}>
        {selectedTags.length === 0 && (
          <span style={{ padding: '5px 6px', fontSize: 12, color: 'var(--text-4)' }}>タグを選択（任意）</span>
        )}
        {selectedTags.map(t => (
          <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 4px 3px 8px', borderRadius: 999, background: 'var(--card-2)', border: '1px solid var(--border)', fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.color }}/>
            {t.name}
            <button type="button" onClick={() => onChange(value.filter(id => id !== t.id))} style={{ width: 16, height: 16, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <Icon name="close" size={10} strokeWidth={2.5}/>
            </button>
          </span>
        ))}
        <button type="button" onClick={() => setOpen(o => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, background: open ? 'var(--accent-soft)' : 'transparent', border: `1px dashed ${open ? 'var(--accent)' : 'var(--border-2)'}`, color: open ? 'var(--accent-text)' : 'var(--text-3)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Icon name="plus" size={11} strokeWidth={2.5}/> 追加
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)', maxHeight: 140, overflow: 'auto' }}>
          {unselected.length === 0 ? (
            <div style={{ padding: '6px 4px', fontSize: 11.5, color: 'var(--text-4)' }}>すべて選択済みです</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {unselected.map(t => (
                <button key={t.id} type="button" onClick={() => onChange([...value, t.id])} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 999, background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--accent-soft)'; el.style.borderColor = 'var(--accent)'; el.style.color = 'var(--accent-text)' }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--card-2)'; el.style.borderColor = 'var(--border)'; el.style.color = 'var(--text-2)' }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.color }}/>{t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Filter popover ───────────────────────────────────────────────
interface FilterPopoverProps {
  statuses: StatusKey[]
  onChange: (statuses: StatusKey[]) => void
  onClose: () => void
}

const FilterPopover = ({ statuses, onChange, onClose }: FilterPopoverProps) => {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const toggle = (s: StatusKey) => {
    onChange(statuses.includes(s) ? statuses.filter(x => x !== s) : [...statuses, s])
  }

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', right: 0, marginTop: 4,
      width: 240, background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 200, padding: 12,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        ステータス
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {STATUS_ORDER.map(s => {
          const cfg = STATUS[s]
          const checked = statuses.includes(s)
          return (
            <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--card-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <input type="checkbox" checked={checked} onChange={() => toggle(s)}
                style={{ width: 14, height: 14, accentColor: cfg.dot, cursor: 'pointer' }}
              />
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }}/>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{cfg.label}</span>
            </label>
          )
        })}
      </div>
      {statuses.length > 0 && (
        <button onClick={() => onChange([])} style={{
          marginTop: 10, width: '100%', padding: '7px 0',
          border: '1px solid var(--border)', borderRadius: 6,
          background: 'transparent', color: 'var(--text-3)',
          fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          フィルターをクリア
        </button>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────
interface ProjectListViewProps {
  openPanel?: (project?: ProjectDto) => void
  isMobile?: boolean
}

function formatDates(start: string | null, end: string | null): string {
  if (!start) return '—'
  const fmt = (d: string) => {
    const [, m, day] = d.split('-')
    return `${Number(m)}/${Number(day)}`
  }
  return end && end !== start ? `${fmt(start)}–${fmt(end)}` : fmt(start)
}

async function fetchProjects(): Promise<ProjectDto[]> {
  const res = await fetch('/api/projects')
  if (!res.ok) throw new Error('fetch failed')
  return res.json() as Promise<ProjectDto[]>
}

async function fetchStatuses(): Promise<ProjectStatusDto[]> {
  const res = await fetch('/api/projects/statuses')
  if (!res.ok) throw new Error('fetch failed')
  return res.json() as Promise<ProjectStatusDto[]>
}

async function createProject(body: {
  title: string
  description?: string | undefined
  statusId?: string | undefined
  startDate?: string | undefined
  endDate?: string | undefined
}): Promise<ProjectDto> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('プロジェクトの作成に失敗しました')
  return res.json() as Promise<ProjectDto>
}

interface CreateProjectModalProps {
  onClose: () => void
  onCreated: (project: ProjectDto) => void
}

interface FormState {
  title: string
  description: string
  status: StatusKey
  startDate: string
  endDate: string
  coverIdx: number
  tags: string[]
}

const CreateProjectModal = ({ onClose, onCreated }: CreateProjectModalProps) => {
  const { data: statuses = [] } = useQuery({ queryKey: ['project-statuses'], queryFn: fetchStatuses })

  const [form, setForm] = React.useState<FormState>({
    title: '', description: '', status: 'plan',
    startDate: '', endDate: '', coverIdx: 0, tags: [],
  })
  const [errors, setErrors] = React.useState<{ title?: string; endDate?: string }>({})
  const titleRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    setTimeout(() => titleRef.current?.focus(), 80)
  }, [])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const clearError = (k: 'title' | 'endDate') =>
    setErrors(prev => { const next = { ...prev }; delete next[k]; return next })

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: (project) => { onCreated(project); onClose() },
    onError: (err: Error) => setErrors(prev => ({ ...prev, title: err.message })),
  })

  const validate = () => {
    const e: { title?: string; endDate?: string } = {}
    if (!form.title.trim()) e.title = 'プロジェクト名を入力してください'
    else if (form.title.trim().length > 60) e.title = '60文字以内で入力してください'
    if (form.startDate && form.endDate && form.endDate < form.startDate)
      e.endDate = '終了日は開始日以降にしてください'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    const selectedStatus = statuses.find(s => s.name === form.status)
    mutation.mutate({
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      statusId: selectedStatus?.id,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--overlay)' }} onClick={onClose}/>

      <form onSubmit={handleSubmit} style={{
        position: 'relative',
        width: '100%', maxWidth: 960,
        maxHeight: 'calc(100vh - 48px)',
        background: 'var(--card)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <header style={{ padding: '16px 20px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="folder" size={16}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>新規プロジェクト</h2>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>
              山行・合宿・講習会など、計画単位のプロジェクトを作成します
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--card-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Icon name="close" size={16}/>
          </button>
        </header>

        {/* Body — 2 columns */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) 360px' }}>
          {/* Left — basic info */}
          <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Field label="プロジェクト名" required error={errors.title} hint={`${form.title.length}/60`} htmlFor="cpm-title">
              <input id="cpm-title" ref={titleRef}
                value={form.title}
                onChange={e => { set('title', e.target.value); if (errors.title) clearError('title') }}
                placeholder="例: 北アルプス縦走計画"
                style={fieldInputStyle(!!errors.title)}
                onFocus={onFocusRing}
                onBlur={e => onBlurRing(e, !!errors.title)}
              />
            </Field>

            <Field label="説明" hint="任意 — メンバーに見える概要" htmlFor="cpm-desc">
              <textarea id="cpm-desc"
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="目的・日程の概要・備考など"
                rows={5}
                style={fieldTextareaStyle(false)}
                onFocus={onFocusRing}
                onBlur={e => onBlurRing(e, false)}
              />
            </Field>

            <Field label="ステータス" required>
              <StatusChipSelector value={form.status} onChange={v => set('status', v)}/>
            </Field>
          </div>

          {/* Right — meta */}
          <div style={{ padding: '20px 22px', borderLeft: '1px solid var(--divider)', background: 'var(--card-2)', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="開始日" htmlFor="cpm-start">
                <input id="cpm-start" type="date"
                  value={form.startDate}
                  onChange={e => set('startDate', e.target.value)}
                  style={{ ...fieldInputStyle(false), background: 'var(--card)' }}
                  onFocus={onFocusRing}
                  onBlur={e => onBlurRing(e, false)}
                />
              </Field>
              <Field label="終了日" error={errors.endDate} htmlFor="cpm-end">
                <input id="cpm-end" type="date"
                  value={form.endDate}
                  onChange={e => { set('endDate', e.target.value); if (errors.endDate) clearError('endDate') }}
                  min={form.startDate || undefined}
                  style={{ ...fieldInputStyle(!!errors.endDate), background: 'var(--card)' }}
                  onFocus={onFocusRing}
                  onBlur={e => onBlurRing(e, !!errors.endDate)}
                />
              </Field>
            </div>

            <Field label="タグ" hint={`${form.tags.length}件選択`}>
              <TagPicker value={form.tags} onChange={v => set('tags', v)}/>
            </Field>

            <Field label="カバー写真" hint="一覧・パネルで表示">
              <CoverPicker value={form.coverIdx} onChange={v => set('coverIdx', v)}/>
              <div style={{ marginTop: 10, position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <MountainPhoto idx={form.coverIdx} height={90} flat radius={0}/>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)', display: 'flex', alignItems: 'flex-end', padding: '8px 10px', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {form.title || 'プロジェクト名'}
                  </span>
                  <StatusChip s={form.status}/>
                </div>
              </div>
            </Field>
          </div>
        </div>

        {/* Footer */}
        <footer style={{ padding: '12px 20px', borderTop: '1px solid var(--divider)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="users" size={12}/>
            作成後にメンバーを招待できます
          </span>
          <div style={{ flex: 1 }}/>
          <button type="button" onClick={onClose} className="btn" disabled={mutation.isPending}>キャンセル</button>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending} style={{ opacity: mutation.isPending ? 0.7 : 1 }}>
            {mutation.isPending ? '作成中…' : '作成する'}
          </button>
        </footer>
      </form>
    </div>
  )
}

export const ProjectListView = ({ openPanel, isMobile }: ProjectListViewProps) => {
  const queryClient = useQueryClient()
  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects })
  const [view, setView] = React.useState<'grid' | 'table'>('grid')
  const [filter, setFilter] = React.useState('all')
  const [showCreate, setShowCreate] = React.useState(false)
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [statusFilter, setStatusFilter] = React.useState<StatusKey[]>([])
  const filterBtnRef = React.useRef<HTMLDivElement>(null)
  const [search, setSearch] = React.useState('')
  const [selectedProject, setSelectedProject] = React.useState<ProjectDto | null>(null)
  const mobileFilter = filter as 'all' | 'active' | 'mine'

  const handleCreated = (project: ProjectDto) => {
    queryClient.setQueryData<ProjectDto[]>(['projects'], prev => [...(prev ?? []), project])
    void queryClient.invalidateQueries({ queryKey: chatQueryKeys.projectChannels })
  }

  // Tab filter counts
  const counts = {
    all:      projects.filter(p => !p.archived).length,
    mine:     projects.filter(p => p.isMember && !p.archived).length,
    owned:    projects.filter(p => p.isOwner && !p.archived).length,
    active:   projects.filter(p => p.statusName !== 'done' && !p.archived).length,
    archived: projects.filter(p => p.archived).length,
  }

  // Apply tab filter
  const tabFiltered = React.useMemo(() => {
    switch (filter) {
      case 'mine':     return projects.filter(p => p.isMember && !p.archived)
      case 'owned':    return projects.filter(p => p.isOwner && !p.archived)
      case 'active':   return projects.filter(p => p.statusName !== 'done' && !p.archived)
      case 'archived': return projects.filter(p => p.archived)
      default:         return projects.filter(p => !p.archived)
    }
  }, [projects, filter])

  // Apply status filter from popover
  const filteredProjects = React.useMemo(() => {
    if (statusFilter.length === 0) return tabFiltered
    return tabFiltered.filter(p => statusFilter.includes(p.statusName as StatusKey))
  }, [tabFiltered, statusFilter])

  const mobileFiltered = React.useMemo(() => {
    return projects.filter(p => {
      if (p.archived) return false
      if (mobileFilter === 'active' && p.statusName === 'done') return false
      if (mobileFilter === 'mine' && !p.isMember) return false
      if (search && !p.title.includes(search)) return false
      return true
    })
  }, [projects, mobileFilter, search])

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)' }}>
        {selectedProject && (
          <ProjectPanel project={selectedProject} onClose={() => setSelectedProject(null)} isMobile/>
        )}
        {showCreate && (
          <CreateProjectSheet
            onClose={() => setShowCreate(false)}
            onCreated={(project) => { handleCreated(project); setSelectedProject(project) }}
          />
        )}
        <MobileHeader title="プロジェクト" right={
          <button onClick={() => setShowCreate(true)} style={{ border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="plus" size={13}/> 新規
          </button>
        }/>

        <div style={{ padding: '12px 16px 0' }}>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '0 12px', height: 40, marginBottom: 12 }}>
            <Icon name="search" size={15} color="var(--text-3)"/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="プロジェクトを検索" style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14, color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }}/>
          </div>
          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {([
              { id: 'all',    label: 'すべて' },
              { id: 'active', label: '進行中' },
              { id: 'mine',   label: '参加中' },
            ] as const).map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding: '6px 14px', borderRadius: 999, border: 'none', background: filter === f.id ? 'var(--accent)' : 'var(--card)', color: filter === f.id ? 'var(--on-accent)' : 'var(--text-3)', fontSize: 13, fontWeight: filter === f.id ? 600 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '0 16px', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>読み込み中…</div>
          ) : mobileFiltered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>プロジェクトが見つかりません</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {mobileFiltered.map(p => {
                const cfg = STATUS[p.statusName as StatusKey]
                const accent = cfg?.dot ?? 'var(--text-3)'
                return (
                  <div key={p.id} onClick={() => setSelectedProject(p)} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px', cursor: 'pointer', transition: 'transform .15s' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4, lineHeight: 1.3 }}>{p.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{formatDates(p.startDate, p.endDate)} · {p.memberCount}人</div>
                      </div>
                      <StatusChip s={p.statusName as StatusKey}/>
                    </div>
                    {p.taskCount > 0 && (
                      <div style={{ height: 4, borderRadius: 2, background: 'var(--divider)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.round((p.completedTaskCount / p.taskCount) * 100)}%`, background: accent, borderRadius: 2 }}/>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 10, gap: 12, fontSize: 12, color: 'var(--text-3)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="users" size={12}/> {p.memberCount}</span>
                      {p.taskCount > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="check" size={12}/> {p.completedTaskCount}/{p.taskCount}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '20px 24px', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'all',      l: 'すべて',     n: counts.all },
            { id: 'mine',     l: '参加中',     n: counts.mine },
            { id: 'owned',    l: '主催',       n: counts.owned },
            { id: 'active',   l: '進行中',     n: counts.active },
            { id: 'archived', l: 'アーカイブ', n: counts.archived },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: '10px 14px', border: 'none', background: 'transparent',
              color: filter === f.id ? 'var(--text)' : 'var(--text-3)',
              fontSize: 13, fontWeight: filter === f.id ? 600 : 500,
              cursor: 'pointer', fontFamily: 'inherit',
              borderBottom: filter === f.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {f.l}
              <span style={{ fontSize: 11, color: 'var(--text-4)', fontWeight: 600 }}>{f.n}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 8 }}>
          <div style={{ display: 'flex', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
            {[
              { id: 'grid' as const,  i: 'kanban', l: 'カード' },
              { id: 'table' as const, i: 'list',   l: 'テーブル' },
            ].map(v => (
              <button key={v.id} onClick={() => setView(v.id)} style={{
                padding: '5px 10px', borderRadius: 6, border: 'none',
                background: view === v.id ? 'var(--card)' : 'transparent',
                color: view === v.id ? 'var(--text)' : 'var(--text-3)',
                fontSize: 12, fontWeight: view === v.id ? 600 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: view === v.id ? 'var(--shadow-sm)' : 'none',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}><Icon name={v.i} size={12}/> {v.l}</button>
            ))}
          </div>
          <div ref={filterBtnRef} style={{ position: 'relative' }}>
            <button
              className="btn"
              onClick={() => setFilterOpen(o => !o)}
              style={statusFilter.length > 0 ? { borderColor: 'var(--accent)', color: 'var(--accent-text)', background: 'var(--accent-soft)' } : {}}
            >
              <Icon name="filter" size={13}/> フィルター
              {statusFilter.length > 0 && (
                <span style={{ marginLeft: 4, background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 999, fontSize: 10, fontWeight: 700, padding: '1px 5px' }}>
                  {statusFilter.length}
                </span>
              )}
            </button>
            {filterOpen && (
              <FilterPopover
                statuses={statusFilter}
                onChange={setStatusFilter}
                onClose={() => setFilterOpen(false)}
              />
            )}
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Icon name="plus" size={13}/> 新規プロジェクト</button>
        </div>
      </div>

      {view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filteredProjects.map((p, i) => {
            const accent = STATUS[p.statusName as StatusKey]?.dot ?? 'var(--text-3)'
            const progress = p.taskCount > 0 ? Math.round((p.completedTaskCount / p.taskCount) * 100) : 0
            return (
              <div key={p.id} onClick={() => openPanel?.(p)} style={{
                background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
                overflow: 'hidden', cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
                transition: 'transform .15s, box-shadow .15s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)' }}
              >
                <div style={{ position: 'relative' }}>
                  <MountainPhoto idx={i + 2} height={120} flat/>
                  <div style={{ position: 'absolute', top: 10, left: 10 }}>
                    <StatusChip s={p.statusName as StatusKey}/>
                  </div>
                </div>
                <div style={{ padding: '12px 14px 14px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>{formatDates(p.startDate, p.endDate)} · {p.memberCount}人</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <AvatarStack names={p.memberNames} size={22}/>
                    <div style={{ display: 'flex', gap: 8, fontSize: 11.5, color: 'var(--text-3)' }}>
                      {p.taskCount > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Icon name="check" size={12}/>{p.completedTaskCount}/{p.taskCount}
                        </span>
                      )}
                    </div>
                  </div>
                  {p.taskCount > 0 && (
                    <div style={{ marginTop: 10, height: 5, borderRadius: 3, background: 'var(--divider)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${progress}%`, background: accent, borderRadius: 3 }}/>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 120px 120px 120px 100px 32px', gap: 16, padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            <span/><span>プロジェクト</span><span>ステータス</span><span>日程</span><span>メンバー</span><span>進捗</span><span/>
          </div>
          {filteredProjects.map((p, i) => {
            const accent = STATUS[p.statusName as StatusKey]?.dot ?? 'var(--text-3)'
            const progress = p.taskCount > 0 ? Math.round((p.completedTaskCount / p.taskCount) * 100) : 0
            return (
              <div key={p.id} onClick={() => openPanel?.(p)} style={{
                display: 'grid', gridTemplateColumns: '24px 1fr 120px 120px 120px 100px 32px',
                gap: 16, padding: '12px 16px', borderBottom: i < filteredProjects.length - 1 ? '1px solid var(--divider)' : 'none',
                alignItems: 'center', cursor: 'pointer',
              }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--card-2)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <span style={{ width: 10, height: 10, borderRadius: 3, background: accent }}/>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{p.title}</span>
                <StatusChip s={p.statusName as StatusKey}/>
                <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{formatDates(p.startDate, p.endDate)}</span>
                <AvatarStack names={p.memberNames} size={22}/>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--divider)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: accent, borderRadius: 3 }}/>
                </div>
                <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}><Icon name="more" size={14}/></button>
              </div>
            )
          })}
        </div>
      )}
      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onCreated={handleCreated}/>}
    </div>
  )
}
