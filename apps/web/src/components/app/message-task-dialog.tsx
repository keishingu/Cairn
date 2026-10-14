// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useT } from '@/components/locale-provider'
import { TaskDialog } from './task-dialog'
import { TASK_TITLE_MAX_LENGTH } from '@/lib/tasks/title-from-message'
import type { MessageTaskCandidateDto } from '@/app/api/messages/[messageId]/task/route'

export interface MessageTaskSubmitItem {
  /** 候補の行そのまま（作成済み判定のキー） */
  line: string
  /** 利用者が編集したタスク名 */
  title: string
}

interface Row {
  /** 候補の行。編集しても変わらない */
  line: string
  title: string
  selected: boolean
  /** 作成済みの行は選択も編集もできない */
  taskId: string | null
}

/** 初期選択: 未作成のリスト項目すべて。無ければ未作成の先頭1件。 */
export function initialMessageTaskRows(candidates: MessageTaskCandidateDto[]): Row[] {
  const hasOpenListItem = candidates.some(c => c.isListItem && !c.taskId)
  const firstOpenIndex = candidates.findIndex(c => !c.taskId)
  return candidates.map((candidate, index) => ({
    line: candidate.line,
    title: candidate.title,
    taskId: candidate.taskId,
    selected: !candidate.taskId && (hasOpenListItem ? candidate.isListItem : index === firstOpenIndex),
  }))
}

const isValidTitle = (title: string) => {
  const trimmed = title.trim()
  return trimmed.length > 0 && Array.from(trimmed).length <= TASK_TITLE_MAX_LENGTH
}

// メッセージの行を選んでまとめてタスクにするダイアログ。タイトルはその場で編集できる。
export const MessageTaskDialog = ({ candidates, onSubmit, onClose }: {
  candidates: MessageTaskCandidateDto[]
  /** 成功したら true。失敗時は呼び出し側がエラーを知らせ、ダイアログは開いたままにする */
  onSubmit: (items: MessageTaskSubmitItem[]) => Promise<boolean>
  onClose: () => void
}) => {
  const t = useT()
  const [rows, setRows] = React.useState<Row[]>(() => initialMessageTaskRows(candidates))
  const [submitting, setSubmitting] = React.useState(false)

  const selectedRows = rows.filter(row => row.selected)
  // 行（line）ごとに1件。タスク名を同じにしても別の行は別タスクにする
  const items: MessageTaskSubmitItem[] = selectedRows.map(row => ({ line: row.line, title: row.title.trim() }))
  const hasInvalid = selectedRows.some(row => !isValidTitle(row.title))

  const update = (index: number, patch: Partial<Row>) =>
    setRows(current => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting || hasInvalid || items.length === 0) return
    setSubmitting(true)
    try {
      const ok = await onSubmit(items)
      if (ok) onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <TaskDialog
      title={t('Make tasks from this message')}
      subtitle={t('Choose the lines to add as tasks')}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={t('Make {count} tasks', { count: items.length })}
      submittingLabel={t('Adding...')}
      isSubmitting={submitting}
      submitDisabled={items.length === 0 || hasInvalid}
      disableClose={submitting}
    >
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row, index) => {
          const done = row.taskId != null
          const invalid = row.selected && !isValidTitle(row.title)
          return (
            <li key={index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                aria-label={t('Select this line')}
                checked={row.selected}
                disabled={done || submitting}
                onChange={event => update(index, { selected: event.target.checked })}
                style={{ flexShrink: 0, width: 16, height: 16, accentColor: 'var(--accent)' }}
              />
              <input
                type="text"
                aria-label={t('Task title')}
                aria-invalid={invalid || undefined}
                value={row.title}
                readOnly={done}
                disabled={submitting}
                onChange={event => update(index, { title: event.target.value })}
                style={{
                  flex: 1, minWidth: 0, padding: '6px 9px', borderRadius: 7, fontSize: 13.5, fontFamily: 'inherit', outline: 'none',
                  border: `1px solid ${invalid ? 'var(--red-text)' : 'var(--border-2)'}`,
                  background: done ? 'var(--card-2)' : 'var(--input)',
                  color: done ? 'var(--text-3)' : 'var(--text)',
                }}
              />
              {done && (
                <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)' }}>{t('Already a task')}</span>
              )}
            </li>
          )
        })}
      </ul>
    </TaskDialog>
  )
}
