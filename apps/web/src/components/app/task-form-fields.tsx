'use client'

import React from 'react'
import { fieldInputStyle } from './primitives'
import { TaskAssigneeField } from './task-assignee-field'
import type { TaskDto } from '@/app/api/tasks/route'

interface TaskFormFieldsProps {
  title: string
  onTitleChange: (value: string) => void
  priority: TaskDto['priority']
  onPriorityChange: (value: TaskDto['priority']) => void
  dueDate: string
  onDueDateChange: (value: string) => void
  titlePlaceholder?: string
  afterTitle?: React.ReactNode
  // 担当者フィールド（onAssigneeChange を渡したときだけ表示する）
  assigneeId?: string | null
  onAssigneeChange?: (userId: string | null) => void
  assigneeProjectId?: string | null
  assigneeChannelId?: string | null
  assigneeChannelIsPrivate?: boolean
  currentAssignee?: { userId: string; displayName: string; avatarUrl: string | null } | null
  // タイトル欄の直下に出す注記（チャット由来タスクの逆同期警告など）
  titleNote?: React.ReactNode
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-2)',
  display: 'block',
  marginBottom: 6,
}

export const TaskFormFields = ({
  title,
  onTitleChange,
  priority,
  onPriorityChange,
  dueDate,
  onDueDateChange,
  titlePlaceholder,
  afterTitle,
  assigneeId,
  onAssigneeChange,
  assigneeProjectId,
  assigneeChannelId,
  assigneeChannelIsPrivate,
  currentAssignee,
  titleNote,
}: TaskFormFieldsProps) => {
  const id = React.useId()
  return (
    <>
      <div>
        <label htmlFor={`${id}-title`} style={labelStyle}>
          タイトル <span style={{ color: 'var(--red)' }}>*</span>
        </label>
        <input
          id={`${id}-title`}
          className="form-control"
          type="text"
          value={title}
          onChange={e => onTitleChange(e.target.value)}
          placeholder={titlePlaceholder}
          required
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          style={fieldInputStyle(false)}
        />
        {titleNote}
      </div>

      {afterTitle}

      {onAssigneeChange && (
        <TaskAssigneeField
          value={assigneeId ?? null}
          onChange={onAssigneeChange}
          projectId={assigneeProjectId ?? null}
          channelId={assigneeChannelId ?? null}
          channelIsPrivate={assigneeChannelIsPrivate ?? false}
          currentAssignee={currentAssignee ?? null}
        />
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor={`${id}-priority`} style={labelStyle}>優先度</label>
          <select
            id={`${id}-priority`}
            className="form-control"
            value={priority}
            onChange={e => onPriorityChange(e.target.value as TaskDto['priority'])}
            style={fieldInputStyle(false)}
          >
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor={`${id}-due`} style={labelStyle}>期限日</label>
          <input
            id={`${id}-due`}
            className="form-control"
            type="date"
            value={dueDate}
            onChange={e => onDueDateChange(e.target.value)}
            style={fieldInputStyle(false)}
          />
        </div>
      </div>
    </>
  )
}
