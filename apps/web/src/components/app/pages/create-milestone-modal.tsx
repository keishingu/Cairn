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
import { useCreateProjectMilestone, useProjectMilestones } from '@/hooks/use-project-milestones'
import { useT } from '@/components/locale-provider'
import type { MilestoneDto } from '@/app/api/projects/[id]/milestones/route'

interface CreateMilestoneModalProps {
  projectId: string
  projectTitle: string
  onClose: () => void
  onCreated: (milestone: MilestoneDto) => void
}

interface EditMilestoneModalProps {
  projectId: string
  projectTitle: string
  milestoneId: string
  onClose: () => void
}

interface MilestoneFormValues {
  title: string
  description: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
}

interface MilestoneFormModalProps {
  projectTitle: string
  initialMilestone?: MilestoneDto
  pending: boolean
  onClose: () => void
  onSubmit: (values: MilestoneFormValues, onError: (message: string) => void) => void
}

const modalCardStyle: React.CSSProperties = {
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
}

function MilestoneFormModal({ projectTitle, initialMilestone, pending, onClose, onSubmit }: MilestoneFormModalProps) {
  const t = useT()
  const editing = initialMilestone != null
  const [title, setTitle] = React.useState(initialMilestone?.title ?? '')
  const [description, setDescription] = React.useState(initialMilestone?.description ?? '')
  const [startDate, setStartDate] = React.useState(initialMilestone?.startDate ?? '')
  const [endDate, setEndDate] = React.useState(initialMilestone?.endDate ?? '')
  const [startTime, setStartTime] = React.useState(initialMilestone?.startTime?.slice(0, 5) ?? '')
  const [endTime, setEndTime] = React.useState(initialMilestone?.endTime?.slice(0, 5) ?? '')
  const [titleError, setTitleError] = React.useState('')
  const [endDateError, setEndDateError] = React.useState('')
  const titleRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const timer = window.setTimeout(() => titleRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    let invalid = false
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setTitleError(t('Enter a milestone name'))
      invalid = true
    } else if (trimmedTitle.length > 100) {
      setTitleError(t('Enter 100 characters or fewer'))
      invalid = true
    } else {
      setTitleError('')
    }

    if (startDate && endDate && endDate < startDate) {
      setEndDateError(t('End date must be on or after the start date'))
      invalid = true
    } else {
      setEndDateError('')
    }

    if (invalid) return

    onSubmit({ title: trimmedTitle, description: description.trim(), startDate, endDate, startTime, endTime }, setTitleError)
  }

  return (
    <Modal onClose={() => { if (!pending) onClose() }}>
      <form
        onSubmit={handleSubmit}
        style={modalCardStyle}
      >
        <ModalHeader
          icon="flag"
          title={editing ? t('Edit milestone') : t('Create milestone')}
          subtitle={projectTitle}
          onClose={() => { if (!pending) onClose() }}
        />

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>
          <Field label={t('Milestone name')} required error={titleError} hint={`${title.length}/100`} htmlFor="milestone-title">
            <input
              id="milestone-title"
              ref={titleRef}
              value={title}
              maxLength={100}
              onChange={event => { setTitle(event.target.value); if (titleError) setTitleError('') }}
              placeholder={t('e.g. First release')}
              style={fieldInputStyle(!!titleError)}
              onFocus={onFocusRing}
              onBlur={event => onBlurRing(event, !!titleError)}
            />
          </Field>

          <Field label={t('Description')} hint={`${description.length}/1000`} htmlFor="milestone-description">
            <textarea
              id="milestone-description"
              value={description}
              maxLength={1000}
              onChange={event => setDescription(event.target.value)}
              placeholder={t('Describe the outcome or what to check')}
              rows={3}
              style={fieldTextareaStyle(false)}
              onFocus={onFocusRing}
              onBlur={event => onBlurRing(event, false)}
            />
          </Field>

          <fieldset style={{ margin: 0, padding: 0, border: 'none' }}>
            <legend style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>{t('Period')}</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
              <Field label={t('Start date')} htmlFor="milestone-start-date">
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
              <Field label={t('End date')} error={endDateError} htmlFor="milestone-end-date">
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
              <Field label={t('Start time')} htmlFor="milestone-start-time">
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
              <Field label={t('End time')} htmlFor="milestone-end-time">
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
          {!editing && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-3)' }}>
              <Icon name="chat" size={12}/>
              {t('A dedicated chat is also created')}
            </span>
          )}
          <div style={{ flex: 1 }}/>
          <button type="button" className="btn" onClick={onClose} disabled={pending}>{t('Cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={pending} style={{ opacity: pending ? 0.7 : 1 }}>
            {pending ? (editing ? t('Saving…') : t('Creating…')) : (editing ? t('Save changes') : t('Create'))}
          </button>
        </footer>
      </form>
    </Modal>
  )
}

export function CreateMilestoneModal({ projectId, projectTitle, onClose, onCreated }: CreateMilestoneModalProps) {
  const createMilestone = useCreateProjectMilestone(projectId)

  return (
    <MilestoneFormModal
      projectTitle={projectTitle}
      pending={createMilestone.isPending}
      onClose={onClose}
      onSubmit={(values, onError) => createMilestone.mutate(
        {
          title: values.title,
          ...(values.description ? { description: values.description } : {}),
          ...(values.startDate ? { startDate: values.startDate } : {}),
          ...(values.endDate ? { endDate: values.endDate } : {}),
          ...(values.startTime ? { startTime: values.startTime } : {}),
          ...(values.endTime ? { endTime: values.endTime } : {}),
        },
        {
          onSuccess: milestone => {
            onCreated(milestone)
            onClose()
          },
          onError: error => onError(error.message),
        },
      )}
    />
  )
}

export function EditMilestoneModal({ projectId, projectTitle, milestoneId, onClose }: EditMilestoneModalProps) {
  const t = useT()
  const milestones = useProjectMilestones(projectId)
  const milestone = milestones.data?.find(item => item.id === milestoneId)

  if (!milestones.isFetchedAfterMount) {
    return (
      <Modal onClose={onClose}>
        <div style={modalCardStyle}>
          <ModalHeader icon="flag" title={t('Edit milestone')} subtitle={projectTitle} onClose={onClose}/>
          <div style={{ padding: '32px 22px', color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }}>{t('Loading...')}</div>
        </div>
      </Modal>
    )
  }

  if (milestones.isError || !milestone) {
    return (
      <Modal onClose={onClose}>
        <div style={modalCardStyle}>
          <ModalHeader icon="flag" title={t('Edit milestone')} subtitle={projectTitle} onClose={onClose}/>
          <div style={{ padding: '32px 22px', color: 'var(--danger)', fontSize: 13, textAlign: 'center' }}>
            {t('Could not load the milestone')}
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <MilestoneFormModal
      projectTitle={projectTitle}
      initialMilestone={milestone}
      pending={milestones.patchMutation.isPending}
      onClose={onClose}
      onSubmit={(values, onError) => milestones.patchMutation.mutate(
        {
          id: milestoneId,
          input: {
            title: values.title,
            description: values.description || null,
            startDate: values.startDate || null,
            endDate: values.endDate || null,
            startTime: values.startTime || null,
            endTime: values.endTime || null,
          },
        },
        {
          onSuccess: onClose,
          onError: error => onError(error.message),
        },
      )}
    />
  )
}
