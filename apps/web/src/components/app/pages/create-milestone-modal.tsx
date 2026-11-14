'use client'

import React from 'react'
import { isMilestonePeriodReversed, MILESTONE_PERIOD_ERROR } from '@cairn/shared'
import {
  Field,
  Icon,
  Modal,
  ModalHeader,
  fieldInputStyle,
  fieldTextareaStyle,
  onBlurRing,
  onFocusRing,
  sheetFieldInputStyle,
  sheetFieldLabelStyle,
} from '../primitives'
import { useAppShell } from '../app-shell-context'
import { MobileFormSheet } from '../mobile/form-sheet'
import { DateRangePicker } from '../mobile/date-range-sheet'
import { useCreateProjectMilestone, useProjectMilestones } from '@/hooks/use-project-milestones'
import { useT } from '@/components/locale-provider'
import type { MilestoneDto } from '@/app/api/projects/[id]/milestones/route'

interface CreateMilestoneModalProps {
  projectId: string
  projectTitle: string
  onClose: () => void
  onCreated: (milestone: MilestoneDto) => void
  /** モバイルのカレンダーを最初に開く月（プロジェクトの開始日）。未指定なら今月 */
  defaultMonth?: string | null
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
  defaultMonth?: string | null
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

function MilestoneFormModal({ projectTitle, initialMilestone, pending, onClose, onSubmit, defaultMonth = null }: MilestoneFormModalProps) {
  const t = useT()
  const { isMobile } = useAppShell()
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
    // モバイルのシートでは自動でフォーカスしない。開くアニメーション中にキーボードが出ると
    // iOS がシートを持ち上げられず、保存ボタンがキーボードの裏に隠れる（入力欄を押した時は持ち上がる）
    if (isMobile) return
    const timer = window.setTimeout(() => titleRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [isMobile])

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

    if (isMilestonePeriodReversed({ startDate, endDate, startTime, endTime })) {
      setEndDateError(t('End date and time must be on or after the start'))
      invalid = true
    } else {
      setEndDateError('')
    }

    if (invalid) return

    onSubmit({ title: trimmedTitle, description: description.trim(), startDate, endDate, startTime, endTime }, setTitleError)
  }

  const heading = editing ? t('Edit milestone') : t('Create milestone')

  // モバイルはプロジェクト作成・タスク作成と同じボトムシートで、日程はカレンダーから選ぶ
  if (isMobile) {
    return (
      <MobileFormSheet
        icon="flag"
        title={heading}
        subtitle={projectTitle}
        onClose={onClose}
        onSubmit={handleSubmit}
        submitLabel={editing ? t('Save changes') : t('Create')}
        submittingLabel={editing ? t('Saving…') : t('Creating…')}
        isSubmitting={pending}
        disableClose={pending}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <label htmlFor="milestone-title" style={sheetFieldLabelStyle}>
              {t('Milestone name')} <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-4)' }}>{title.length}/100</span>
          </div>
          <input
            id="milestone-title"
            ref={titleRef}
            value={title}
            maxLength={100}
            onChange={event => { setTitle(event.target.value); if (titleError) setTitleError('') }}
            placeholder={t('e.g. First release')}
            aria-invalid={!!titleError}
            style={sheetFieldInputStyle(!!titleError)}
          />
          {titleError && <div role="alert" style={{ marginTop: 5, fontSize: 'var(--fs-sm)', color: 'var(--red-text)' }}>{titleError}</div>}
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <label htmlFor="milestone-description" style={sheetFieldLabelStyle}>{t('Description')}</label>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-4)' }}>{description.length}/1000</span>
          </div>
          <textarea
            id="milestone-description"
            value={description}
            maxLength={1000}
            onChange={event => setDescription(event.target.value)}
            placeholder={t('Describe the outcome or what to check')}
            rows={3}
            style={{ ...sheetFieldInputStyle(false), height: 'auto', padding: '10px 12px', resize: 'none', lineHeight: 1.55 }}
          />
        </div>

        <div>
          <div style={{ ...sheetFieldLabelStyle, marginBottom: 8 }}>{t('Period')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <DateRangePicker
              value={{ start: startDate || null, end: endDate || null, startTime, endTime }}
              onChange={v => { setStartDate(v.start ?? ''); setEndDate(v.end ?? ''); setStartTime(v.startTime); setEndTime(v.endTime) }}
              withTime
              defaultMonth={defaultMonth}
            />
          </div>
          {endDateError && <div role="alert" style={{ marginTop: 5, fontSize: 'var(--fs-sm)', color: 'var(--red-text)' }}>{endDateError}</div>}
        </div>

        {!editing && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)', color: 'var(--text-3)' }}>
            <Icon name="chat" size={12}/>
            {t('A dedicated chat is also created')}
          </div>
        )}
      </MobileFormSheet>
    )
  }

  return (
    <Modal onClose={() => { if (!pending) onClose() }} label={heading}>
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
            <legend style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>{t('Period')}</legend>
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
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)', color: 'var(--text-3)' }}>
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

export function CreateMilestoneModal({ projectId, projectTitle, onClose, onCreated, defaultMonth = null }: CreateMilestoneModalProps) {
  const t = useT()
  const createMilestone = useCreateProjectMilestone(projectId)

  return (
    <MilestoneFormModal
      projectTitle={projectTitle}
      defaultMonth={defaultMonth}
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
          onError: error => onError(error.message === MILESTONE_PERIOD_ERROR ? t('End date and time must be on or after the start') : error.message),
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
      <Modal onClose={onClose} label={t('Edit milestone')}>
        <div style={modalCardStyle}>
          <ModalHeader icon="flag" title={t('Edit milestone')} subtitle={projectTitle} onClose={onClose}/>
          <div style={{ padding: '32px 22px', color: 'var(--text-3)', fontSize: 'var(--fs-md)', textAlign: 'center' }}>{t('Loading...')}</div>
        </div>
      </Modal>
    )
  }

  if (milestones.isError || !milestone) {
    return (
      <Modal onClose={onClose} label={t('Edit milestone')}>
        <div style={modalCardStyle}>
          <ModalHeader icon="flag" title={t('Edit milestone')} subtitle={projectTitle} onClose={onClose}/>
          <div style={{ padding: '32px 22px', color: 'var(--danger)', fontSize: 'var(--fs-md)', textAlign: 'center' }}>
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
          onError: error => onError(error.message === MILESTONE_PERIOD_ERROR ? t('End date and time must be on or after the start') : error.message),
        },
      )}
    />
  )
}
