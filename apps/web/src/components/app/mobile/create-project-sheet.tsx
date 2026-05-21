'use client'

import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../primitives'
import { STATUS, type StatusKey } from '../data'
import type { ProjectDto } from '@/app/api/projects/route'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'

const STATUS_ORDER: StatusKey[] = ['plan', 'review', 'wait', 'doing', 'retro', 'done']

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

const inputStyle: React.CSSProperties = {
  width: '100%', height: 44, padding: '0 12px',
  border: '1px solid var(--border)',
  borderRadius: 10, background: 'var(--card-2)',
  color: 'var(--text)', fontSize: 15,
  fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box',
}

const inputErrorStyle: React.CSSProperties = {
  ...inputStyle,
  border: '1px solid var(--red)',
}

interface CreateProjectSheetProps {
  onClose: () => void
  onCreated: (project: ProjectDto) => void
}

export function CreateProjectSheet({ onClose, onCreated }: CreateProjectSheetProps) {
  const queryClient = useQueryClient()
  const { data: statuses = [] } = useQuery({ queryKey: ['project-statuses'], queryFn: fetchStatuses })

  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [status, setStatus] = React.useState<StatusKey>('plan')
  const [startDate, setStartDate] = React.useState('')
  const [endDate, setEndDate] = React.useState('')
  const [titleError, setTitleError] = React.useState('')
  const [endDateError, setEndDateError] = React.useState('')

  const titleRef = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => { setTimeout(() => titleRef.current?.focus(), 150) }, [])

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: (project) => {
      queryClient.setQueryData<ProjectDto[]>(['projects'], old => [project, ...(old ?? [])])
      onCreated(project)
      onClose()
    },
    onError: (err: Error) => setTitleError(err.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    let hasError = false
    if (!title.trim()) {
      setTitleError('プロジェクト名を入力してください')
      hasError = true
    } else if (title.trim().length > 60) {
      setTitleError('60文字以内で入力してください')
      hasError = true
    } else {
      setTitleError('')
    }
    if (startDate && endDate && endDate < startDate) {
      setEndDateError('終了日は開始日以降にしてください')
      hasError = true
    } else {
      setEndDateError('')
    }
    if (hasError) return

    const selectedStatus = statuses.find(s => s.name === status)
    mutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      statusId: selectedStatus?.id,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.4)',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 301,
        background: 'var(--card)',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        boxShadow: '0 -4px 32px rgba(0,0,0,0.18)',
        maxHeight: '90dvh',
        display: 'flex', flexDirection: 'column',
        animation: 'slideUpSheet .22s cubic-bezier(.2,.7,.3,1)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-2)' }}/>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '4px 20px 14px', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="folder" size={16}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>新規プロジェクト</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>基本情報を入力してください</div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'var(--card-2)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <Icon name="close" size={15}/>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflow: 'auto', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Title */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>
                プロジェクト名 <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{title.length}/60</span>
            </div>
            <input
              ref={titleRef}
              value={title}
              onChange={e => { setTitle(e.target.value); if (titleError) setTitleError('') }}
              placeholder="例: 北アルプス縦走計画"
              style={titleError ? inputErrorStyle : inputStyle}
            />
            {titleError && (
              <div style={{ marginTop: 5, fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--red)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>!</span>
                {titleError}
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>説明</label>
              <span style={{ fontSize: 11, color: 'var(--text-4)' }}>任意</span>
            </div>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="目的・日程の概要・備考など"
              rows={3}
              style={{ ...inputStyle, height: 'auto', padding: '10px 12px', resize: 'none', lineHeight: 1.55 }}
            />
          </div>

          {/* Status */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 8 }}>
              ステータス <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {STATUS_ORDER.map(s => {
                const cfg = STATUS[s]
                const selected = status === s
                return (
                  <button key={s} type="button" onClick={() => setStatus(s)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '7px 12px', borderRadius: 999,
                    border: `1.5px solid ${selected ? cfg.dot : 'var(--border)'}`,
                    background: selected ? cfg.bg : 'var(--card-2)',
                    color: selected ? cfg.fg : 'var(--text-2)',
                    fontSize: 12.5, fontWeight: selected ? 700 : 500,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }}/>
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>開始日</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{ ...inputStyle, fontSize: 14 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>終了日</label>
              <input
                type="date"
                value={endDate}
                onChange={e => { setEndDate(e.target.value); if (endDateError) setEndDateError('') }}
                min={startDate || undefined}
                style={endDateError ? { ...inputStyle, fontSize: 14, border: '1px solid var(--red)' } : { ...inputStyle, fontSize: 14 }}
              />
              {endDateError && (
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--red)' }}>{endDateError}</div>
              )}
            </div>
          </div>

          {/* spacer for footer */}
          <div style={{ height: 8 }}/>
        </form>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
          borderTop: '1px solid var(--divider)',
          display: 'flex', gap: 10,
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            style={{
              flex: 1, height: 46, borderRadius: 12,
              border: '1px solid var(--border)', background: 'var(--card-2)',
              color: 'var(--text-2)', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            style={{
              flex: 2, height: 46, borderRadius: 12,
              border: 'none',
              background: mutation.isPending ? 'var(--card-2)' : 'var(--accent)',
              color: mutation.isPending ? 'var(--text-4)' : 'var(--on-accent)',
              fontSize: 15, fontWeight: 700,
              cursor: mutation.isPending ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'background 0.15s',
            }}
          >
            {mutation.isPending ? '作成中…' : '作成する'}
          </button>
        </div>
      </div>
    </>
  )
}
