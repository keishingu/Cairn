'use client'

import React from 'react'
import { fieldInputStyle } from './primitives'
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
}: TaskFormFieldsProps) => (
  <>
    <div>
      <label style={labelStyle}>
        タイトル <span style={{ color: 'var(--red)' }}>*</span>
      </label>
      <input
        type="text"
        value={title}
        onChange={e => onTitleChange(e.target.value)}
        placeholder={titlePlaceholder}
        required
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        style={fieldInputStyle(false)}
      />
    </div>

    {afterTitle}

    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <label style={labelStyle}>優先度</label>
        <select
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
        <label style={labelStyle}>期限日</label>
        <input
          type="date"
          value={dueDate}
          onChange={e => onDueDateChange(e.target.value)}
          style={fieldInputStyle(false)}
        />
      </div>
    </div>
  </>
)
