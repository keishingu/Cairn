'use client'

import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fieldInputStyle } from '../primitives'
import { TaskDialog } from '../task-dialog'
import { TaskFormFields } from '../task-form-fields'
import type { TaskDto } from '@/app/api/tasks/route'
import type { ProjectDto } from '@/app/api/projects/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

interface CreateTaskModalProps {
  onClose: () => void
}

export const CreateTaskModal = ({ onClose }: CreateTaskModalProps) => {
  const queryClient = useQueryClient()
  const [title, setTitle] = React.useState('')
  const [projectId, setProjectId] = React.useState('')
  const [priority, setPriority] = React.useState<TaskDto['priority']>('medium')
  const [dueDate, setDueDate] = React.useState('')

  const { data: projects = [] } = useQuery<ProjectDto[]>({
    queryKey: ['projects'],
    queryFn: () => fetchWithAuth('/api/projects').then(r => r.json()),
  })

  const mutation = useMutation({
    mutationFn: async (data: { title: string; projectId: string; priority: string; dueDate?: string }) => {
      const res = await fetchWithAuth('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to create task')
      return res.json() as Promise<TaskDto>
    },
    onSuccess: async (_newTask) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        projectId ? queryClient.invalidateQueries({ queryKey: ['tasks', projectId] }) : Promise.resolve(),
      ])
      onClose()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !projectId) return
    mutation.mutate({
      title: title.trim(),
      projectId,
      priority,
      ...(dueDate ? { dueDate } : {}),
    })
  }

  const errorMessage = mutation.isError ? 'タスクの作成に失敗しました。もう一度お試しください。' : undefined

  return (
    <TaskDialog
      title="タスクを追加"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="追加"
      submittingLabel="追加中..."
      isSubmitting={mutation.isPending}
      submitDisabled={!title.trim() || !projectId}
      disableClose={mutation.isPending}
      {...(errorMessage ? { errorMessage } : {})}
    >
      <TaskFormFields
        title={title}
        onTitleChange={setTitle}
        priority={priority}
        onPriorityChange={setPriority}
        dueDate={dueDate}
        onDueDateChange={setDueDate}
        titlePlaceholder="タスク名を入力..."
        afterTitle={(
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
              プロジェクト <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              required
              style={{ ...fieldInputStyle(false), color: projectId ? 'var(--text)' : 'var(--text-4)' }}
            >
              <option value="" disabled>プロジェクトを選択...</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
        )}
      />
    </TaskDialog>
  )
}
