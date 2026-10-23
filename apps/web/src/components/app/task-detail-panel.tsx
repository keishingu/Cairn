'use client'

import React from 'react'
import Link from 'next/link'
import { Avatar, Icon, Modal, ModalHeader, fieldInputStyle, fieldTextareaStyle } from './primitives'
import { InlineError } from './inline-error'
import { MarkdownContent } from './markdown-content'
import { TaskDeleteDialog } from './task-delete-dialog'
import { TaskFormFields } from './task-form-fields'
import { usePatchTask, useTaskDetail } from '@/hooks/use-tasks'
import { formatTaskTitleForDisplay } from '@/lib/task-title-display'
import { taskScopeLabel } from '@/lib/tasks/scope-label'
import { useLocale, useT } from '@/components/locale-provider'
import type { TaskDetailDto } from '@/app/api/tasks/[id]/route'

const DESCRIPTION_MAX_LENGTH = 10000

interface TaskDetailPanelProps {
  taskId: string
  onClose: () => void
  /** モバイルシェルでは全画面、PC では右からのサイドパネルで表示する。 */
  isMobile?: boolean
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-2)',
}

/**
 * 入力中の Esc は編集の取り消しだけにして、パネルごと閉じない。
 * Modal（Radix）は document の capture で Esc を受けるため、より手前の window の capture で止める。
 */
function useCancelEditOnEscape(active: boolean, onCancel: () => void) {
  const onCancelRef = React.useRef(onCancel)
  onCancelRef.current = onCancel
  React.useEffect(() => {
    if (!active) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onCancelRef.current()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [active])
}

// ─── タイトル（クリックでその場編集） ─────────────────────────────

const TitleEditor = ({ title, onSave }: { title: string; onSave: (title: string) => void }) => {
  const t = useT()
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(title)
  // Enter で確定したあとに blur が続いても二重に保存しない
  const settledRef = React.useRef(false)

  useCancelEditOnEscape(editing, () => { settledRef.current = true; setEditing(false) })

  const startEdit = () => {
    settledRef.current = false
    setDraft(title)
    setEditing(true)
  }

  const commit = () => {
    if (settledRef.current) return
    settledRef.current = true
    setEditing(false)
    const next = draft.trim()
    // 空のまま確定したら元の値へ戻す。変更がなければ保存しない
    if (next === '' || next === title) return
    onSave(next)
  }

  if (editing) {
    return (
      <input
        aria-label={t('Title')}
        className="form-control"
        value={draft}
        maxLength={200}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); commit() } }}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        style={{ ...fieldInputStyle(false), fontSize: 15, fontWeight: 700 }}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      aria-label={t('Edit title')}
      title={t('Edit title')}
      className="hover-bg"
      style={{
        width: '100%', textAlign: 'left', padding: '6px 8px', margin: '-6px -8px',
        border: 'none', borderRadius: 8, background: 'transparent', cursor: 'text',
        fontFamily: 'inherit', fontSize: 16, fontWeight: 700, lineHeight: 1.45,
        color: 'var(--text)', overflowWrap: 'anywhere',
      }}
    >
      {formatTaskTitleForDisplay(title)}
    </button>
  )
}

// ─── 説明（Markdown 表示 / 編集） ─────────────────────────────────

const DescriptionSection = ({ description, saving, error, onSave }: {
  description: string | null
  saving: boolean
  error: string | null
  onSave: (value: string | null, onSuccess: () => void) => void
}) => {
  const t = useT()
  const id = React.useId()
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState('')

  useCancelEditOnEscape(editing && !saving, () => setEditing(false))

  const startEdit = () => {
    setDraft(description ?? '')
    setEditing(true)
  }

  const handleSave = () => {
    const next = draft.trim() === '' ? null : draft
    // 変更がなければ保存せず閉じる
    if (next === (description ?? null)) {
      setEditing(false)
      return
    }
    onSave(next, () => setEditing(false))
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <label htmlFor={editing ? `${id}-description` : undefined} style={sectionLabelStyle}>{t('Description')}</label>
        {!editing && description && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={startEdit}>
            <Icon name="edit" size={13} />
            {t('Edit')}
          </button>
        )}
      </div>

      {editing ? (
        <>
          <textarea
            id={`${id}-description`}
            className="form-control"
            value={draft}
            maxLength={DESCRIPTION_MAX_LENGTH}
            onChange={e => setDraft(e.target.value)}
            placeholder={t('Write a description (Markdown supported)')}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            style={{ ...fieldTextareaStyle(false), minHeight: 160 }}
          />
          {error && <InlineError style={{ marginTop: 8 }}>{error}</InlineError>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-sm" onClick={() => setEditing(false)} disabled={saving}>{t('Cancel')}</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? t('Saving…') : t('Save')}
            </button>
          </div>
        </>
      ) : description ? (
        <div style={{ fontSize: 13.5, color: 'var(--text)', overflowWrap: 'anywhere' }}>
          <MarkdownContent content={description} />
        </div>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="hover-bg"
          style={{
            width: '100%', padding: '12px', borderRadius: 8, border: '1px dashed var(--border-2)',
            background: 'transparent', color: 'var(--text-3)', fontSize: 13, fontFamily: 'inherit',
            cursor: 'pointer', textAlign: 'left',
          }}
        >
          {t('Add a description')}
        </button>
      )}
    </section>
  )
}

// ─── 元のメッセージ ──────────────────────────────────────────────

const SourceMessageSection = ({ task, onNavigate }: { task: TaskDetailDto; onNavigate: () => void }) => {
  const t = useT()
  const { locale } = useLocale()
  const message = task.sourceMessage

  if (!message) {
    // 紐付けがあるのに本文を返せないのは、メッセージが削除済みなどのとき。黙って欄ごと消さない
    if (!task.isLinkedToMessage) return null
    return (
      <section>
        <div style={{ ...sectionLabelStyle, marginBottom: 6 }}>{t('Original message')}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{t('The original message is no longer available')}</div>
      </section>
    )
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={sectionLabelStyle}>{t('Original message')}</span>
        <Link
          href={`/chats/${encodeURIComponent(message.channelId)}?m=${encodeURIComponent(message.id)}`}
          className="btn btn-ghost btn-sm"
          onClick={onNavigate}
        >
          <Icon name="chat" size={13} />
          {t('Open in chat')}
        </Link>
      </div>
      <blockquote
        style={{
          margin: 0, padding: '10px 12px', borderRadius: 8,
          background: 'var(--card-2)', borderLeft: '3px solid var(--border-2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Avatar name={message.senderName} url={message.senderAvatarUrl} size={22} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{message.senderName}</span>
          <time dateTime={message.createdAt} style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
            {new Date(message.createdAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}
          </time>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', overflowWrap: 'anywhere' }}>
          <MarkdownContent content={message.content} fontSize={13} />
        </div>
      </blockquote>
    </section>
  )
}

// ─── パネル本体 ──────────────────────────────────────────────────

export const TaskDetailPanel = ({ taskId, onClose, isMobile = false }: TaskDetailPanelProps) => {
  const t = useT()
  const { locale } = useLocale()
  const { data: task, isLoading, isError, error, refetch } = useTaskDetail(taskId)
  const patchFields = usePatchTask()
  const patchDescription = usePatchTask()
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  const savePatch = (patch: Parameters<typeof patchFields.mutate>[0]['patch']) => {
    patchFields.mutate({ id: taskId, patch })
  }

  const handleSaveDescription = (value: string | null, onSuccess: () => void) => {
    patchDescription.mutate({ id: taskId, patch: { description: value } }, { onSuccess })
  }

  return (
    <Modal onClose={onClose} label={t('Task details')}>
      <aside
        data-task-detail-panel
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0,
          width: isMobile ? '100%' : 'min(480px, 100%)',
          background: 'var(--card)',
          borderLeft: isMobile ? 'none' : '1px solid var(--border)',
          boxShadow: isMobile ? 'none' : 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column', minHeight: 0,
          animation: 'notifSlideIn .2s cubic-bezier(.2,.7,.3,1)',
        }}
      >
        <div style={{ paddingTop: isMobile ? 'env(safe-area-inset-top)' : 0, flexShrink: 0 }}>
          <ModalHeader
            title={t('Task details')}
            {...(task ? { subtitle: taskScopeLabel(task, t) } : {})}
            onClose={onClose}
          />
        </div>

        <div
          style={{
            flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
            padding: 20, paddingBottom: isMobile ? 'calc(20px + env(safe-area-inset-bottom))' : 20,
            display: 'flex', flexDirection: 'column', gap: 20,
          }}
        >
          {isLoading ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{t('Loading...')}</div>
          ) : isError || !task ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
              <InlineError variant="box" style={{ alignSelf: 'stretch' }}>
                {error instanceof Error ? error.message : t('Could not load the task')}
              </InlineError>
              <button type="button" className="btn btn-sm" onClick={() => { void refetch() }}>{t('Retry')}</button>
            </div>
          ) : (
            <>
              <TitleEditor title={task.title} onSave={title => savePatch({ title })} />

              {patchFields.isError && (
                <InlineError variant="box" onDismiss={() => patchFields.reset()}>
                  {patchFields.error instanceof Error ? patchFields.error.message : t('Could not update the task')}
                </InlineError>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <TaskFormFields
                  hideTitle
                  status={task.status}
                  onStatusChange={status => savePatch({ status })}
                  priority={task.priority}
                  onPriorityChange={priority => savePatch({ priority })}
                  dueDate={task.dueDate ?? ''}
                  onDueDateChange={dueDate => savePatch({ dueDate: dueDate || null })}
                  assigneeId={task.assigneeId}
                  onAssigneeChange={assigneeId => savePatch({ assigneeId })}
                  assigneeProjectId={task.projectId}
                  assigneeChannelId={task.channelId}
                  // DM は is_private=false だが参加者しか閲覧・担当できないので、非公開と同じく参加者に絞る
                  assigneeChannelIsPrivate={task.channelIsPrivate || task.channelType === 'dm'}
                  {...(task.assigneeId
                    ? { currentAssignee: { userId: task.assigneeId, displayName: task.assigneeName ?? t('Unknown member'), avatarUrl: task.assigneeAvatarUrl } }
                    : {})}
                />
              </div>

              <DescriptionSection
                description={task.description}
                saving={patchDescription.isPending}
                error={patchDescription.isError
                  ? (patchDescription.error instanceof Error ? patchDescription.error.message : t('Could not update the task'))
                  : null}
                onSave={handleSaveDescription}
              />

              <SourceMessageSection task={task} onNavigate={onClose} />

              <footer
                style={{
                  marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--divider)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}
              >
                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                  {t('Created by {name} on {date}', {
                    name: task.createdByName ?? t('Unknown member'),
                    date: new Date(task.createdAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }),
                  })}
                </span>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
                  <Icon name="trash" size={13} />
                  {t('Delete')}
                </button>
              </footer>
            </>
          )}
        </div>
      </aside>

      <TaskDeleteDialog
        task={confirmDelete && task ? task : null}
        onClose={() => setConfirmDelete(false)}
        onDeleted={onClose}
      />
    </Modal>
  )
}
