'use client'

import React from 'react'
import {
  Field,
  Icon,
  Modal,
  ModalHeader,
  fieldInputStyle,
  fieldTextareaStyle,
  onBlurRing,
  onFocusRing,
} from '../primitives'
import { useCreateProjectMilestone } from '@/hooks/use-project-milestones'
import type { MilestoneDto } from '@/app/api/projects/[id]/milestones/route'

interface CreateMilestoneModalProps {
  projectId: string
  projectTitle: string
  onClose: () => void
  onCreated: (milestone: MilestoneDto) => void
}

export function CreateMilestoneModal({ projectId, projectTitle, onClose, onCreated }: CreateMilestoneModalProps) {
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [startDate, setStartDate] = React.useState('')
  const [endDate, setEndDate] = React.useState('')
  const [startTime, setStartTime] = React.useState('')
  const [endTime, setEndTime] = React.useState('')
  const [titleError, setTitleError] = React.useState('')
  const [endDateError, setEndDateError] = React.useState('')
  const titleRef = React.useRef<HTMLInputElement>(null)
  const createMilestone = useCreateProjectMilestone(projectId)

  React.useEffect(() => {
    const timer = window.setTimeout(() => titleRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    let invalid = false
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setTitleError('マイルストーン名を入力してください')
      invalid = true
    } else if (trimmedTitle.length > 100) {
      setTitleError('100文字以内で入力してください')
      invalid = true
    } else {
      setTitleError('')
    }

    if (startDate && endDate && endDate < startDate) {
      setEndDateError('終了日は開始日以降にしてください')
      invalid = true
    } else {
      setEndDateError('')
    }

    if (invalid) return

    createMilestone.mutate(
      {
        title: trimmedTitle,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        ...(startTime ? { startTime } : {}),
        ...(endTime ? { endTime } : {}),
      },
      {
        onSuccess: milestone => {
          onCreated(milestone)
          onClose()
        },
        onError: error => setTitleError(error.message),
      },
    )
  }

  const pending = createMilestone.isPending

  return (
    <Modal onClose={() => { if (!pending) onClose() }}>
      <form
        onSubmit={handleSubmit}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 500,
          maxHeight: 'calc(100vh - 48px)',
          background: 'var(--card)',
          borderRadius: 14,
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <ModalHeader
          icon="flag"
          title="マイルストーンを作成"
          subtitle={projectTitle}
          onClose={() => { if (!pending) onClose() }}
        />

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>
          <Field label="マイルストーン名" required error={titleError} hint={`${title.length}/100`} htmlFor="milestone-title">
            <input
              id="milestone-title"
              ref={titleRef}
              value={title}
              maxLength={100}
              onChange={event => { setTitle(event.target.value); if (titleError) setTitleError('') }}
              placeholder="例: 初回リリース"
              style={fieldInputStyle(!!titleError)}
              onFocus={onFocusRing}
              onBlur={event => onBlurRing(event, !!titleError)}
            />
          </Field>

          <Field label="説明" hint={`${description.length}/1000`} htmlFor="milestone-description">
            <textarea
              id="milestone-description"
              value={description}
              maxLength={1000}
              onChange={event => setDescription(event.target.value)}
              placeholder="達成したい状態や確認事項を入力"
              rows={3}
              style={fieldTextareaStyle(false)}
              onFocus={onFocusRing}
              onBlur={event => onBlurRing(event, false)}
            />
          </Field>

          <fieldset style={{ margin: 0, padding: 0, border: 'none' }}>
            <legend style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>期間</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
              <Field label="開始日" htmlFor="milestone-start-date">
                <input
                  id="milestone-start-date"
                  type="date"
                  value={startDate}
                  onChange={event => { setStartDate(event.target.value); if (endDateError) setEndDateError('') }}
                  style={fieldInputStyle(false)}
                  onFocus={onFocusRing}
                  onBlur={event => onBlurRing(event, false)}
                />
              </Field>
              <Field label="終了日" error={endDateError} htmlFor="milestone-end-date">
                <input
                  id="milestone-end-date"
                  type="date"
                  value={endDate}
                  onChange={event => { setEndDate(event.target.value); if (endDateError) setEndDateError('') }}
                  style={fieldInputStyle(!!endDateError)}
                  onFocus={onFocusRing}
                  onBlur={event => onBlurRing(event, !!endDateError)}
                />
              </Field>
              <Field label="開始時刻" htmlFor="milestone-start-time">
                <input
                  id="milestone-start-time"
                  type="time"
                  value={startTime}
                  onChange={event => setStartTime(event.target.value)}
                  style={fieldInputStyle(false)}
                  onFocus={onFocusRing}
                  onBlur={event => onBlurRing(event, false)}
                />
              </Field>
              <Field label="終了時刻" htmlFor="milestone-end-time">
                <input
                  id="milestone-end-time"
                  type="time"
                  value={endTime}
                  onChange={event => setEndTime(event.target.value)}
                  style={fieldInputStyle(false)}
                  onFocus={onFocusRing}
                  onBlur={event => onBlurRing(event, false)}
                />
              </Field>
            </div>
          </fieldset>
        </div>

        <footer style={{ padding: '12px 20px', borderTop: '1px solid var(--divider)', background: 'var(--card-2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-3)' }}>
            <Icon name="chat" size={12}/>
            専用チャットも作成されます
          </span>
          <div style={{ flex: 1 }}/>
          <button type="button" className="btn" onClick={onClose} disabled={pending}>キャンセル</button>
          <button type="submit" className="btn btn-primary" disabled={pending} style={{ opacity: pending ? 0.7 : 1 }}>
            {pending ? '作成中…' : '作成する'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
