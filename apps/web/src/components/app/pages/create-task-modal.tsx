'use client'

import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, ModalHeader, fieldInputStyle } from '../primitives'
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
    onSuccess: (newTask) => {
      queryClient.setQueryData<TaskDto[]>(['tasks'], old => old ? [newTask, ...old] : [newTask])
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

  return (
    <Modal onClose={onClose}>
      <div style={{
        position: 'relative',
        background: 'var(--card)', borderRadius: 14,
        width: '100%', maxWidth: 480,
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        animation: 'fadeSlideIn .15s ease',
      }}>
        <ModalHeader title="タスクを追加" onClose={onClose}/>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
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

          {mutation.isError && (
            <div style={{
              fontSize: 12.5, color: 'var(--red-text)', background: 'var(--red-soft)',
              padding: '8px 12px', borderRadius: 6,
            }}>
              タスクの作成に失敗しました。もう一度お試しください。
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose} className="btn" style={{ padding: '8px 16px' }}>
              キャンセル
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!title.trim() || !projectId || mutation.isPending}
              style={{ padding: '8px 16px' }}
            >
              {mutation.isPending ? '追加中...' : '追加'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
