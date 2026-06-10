'use client'

import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../primitives'
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

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const fieldLabel: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: 'var(--text-3)',
    display: 'block', marginBottom: 6,
  }
  const fieldInput: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1.5px solid var(--border-2)', background: 'var(--bg)',
    color: 'var(--text)', fontSize: 14, fontFamily: 'inherit',
    boxSizing: 'border-box' as const, outline: 'none',
  }

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 16px',
      }}
    >
      <div style={{
        background: 'var(--card)', borderRadius: 12,
        width: '100%', maxWidth: 480,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        animation: 'fadeSlideIn .15s ease',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>タスクを追加</span>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 6, border: 'none',
              background: 'transparent', color: 'var(--text-3)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="close" size={15} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={fieldLabel}>
              タイトル <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="タスク名を入力..."
              required
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              style={fieldInput}
            />
          </div>

          <div>
            <label style={fieldLabel}>
              プロジェクト <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              required
              style={{ ...fieldInput, color: projectId ? 'var(--text)' : 'var(--text-4)' }}
            >
              <option value="" disabled>プロジェクトを選択...</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={fieldLabel}>優先度</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as TaskDto['priority'])}
                style={fieldInput}
              >
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={fieldLabel}>期限日</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                style={fieldInput}
              />
            </div>
          </div>

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
    </div>
  )
}
