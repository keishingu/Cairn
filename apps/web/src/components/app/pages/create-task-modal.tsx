'use client'

import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fieldInputStyle } from '../primitives'
import { TaskDialog } from '../task-dialog'
import { TaskFormFields } from '../task-form-fields'
import type { TaskDto } from '@/app/api/tasks/route'
import type { ProjectDto } from '@/app/api/projects/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { useWorkspacePermissions } from '@/hooks/use-current-user'

interface CreateTaskModalProps {
  onClose: () => void
  channel?: CreateTaskChannel
}

export type CreateTaskChannel = { id: string; name: string; isPrivate: boolean }

export const CreateTaskModal = ({ onClose, channel }: CreateTaskModalProps) => {
  const projectSelectId = React.useId()
  const queryClient = useQueryClient()
  const [title, setTitle] = React.useState('')
  const [projectId, setProjectId] = React.useState('')
  const [priority, setPriority] = React.useState<TaskDto['priority']>('medium')
  const [dueDate, setDueDate] = React.useState('')
  const [assigneeId, setAssigneeId] = React.useState<string | null>(null)
  // ゲストは member 以上でないとプロジェクト未所属タスクを作成できない（サーバが 403）。
  // そのためゲストにはプロジェクト選択を必須にし、「プロジェクトなし」を出さない。
  const { isGuest } = useWorkspacePermissions()

  const { data: projects = [] } = useQuery<ProjectDto[]>({
    queryKey: ['projects'],
    queryFn: () => fetchWithAuth('/api/projects').then(r => r.json()),
    enabled: !channel,
  })

  const mutation = useMutation({
    mutationFn: async (data: { title: string; projectId?: string; channelId?: string; priority: string; dueDate?: string; assigneeId?: string }) => {
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
      if (channel) {
        queryClient.setQueryData<TaskDto[]>(['tasks', 'channel', channel.id], old => old ? [newTask, ...old] : [newTask])
      }
      onClose()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    mutation.mutate({
      title: title.trim(),
      ...(channel ? { channelId: channel.id } : projectId ? { projectId } : {}),
      priority,
      ...(dueDate ? { dueDate } : {}),
      ...(assigneeId ? { assigneeId } : {}),
    })
  }

  const errorMessage = mutation.isError ? 'タスクの作成に失敗しました。もう一度お試しください。' : undefined

  return (
    <TaskDialog
      title="タスクを追加"
      {...(channel ? { subtitle: channel.name } : {})}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="追加"
      submittingLabel="追加中..."
      isSubmitting={mutation.isPending}
      submitDisabled={!title.trim() || (!channel && isGuest && !projectId)}
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
        assigneeId={assigneeId}
        onAssigneeChange={setAssigneeId}
        assigneeProjectId={channel ? null : projectId || null}
        assigneeChannelId={channel?.id ?? null}
        assigneeChannelIsPrivate={channel?.isPrivate ?? false}
        titlePlaceholder="タスク名を入力..."
        afterTitle={channel ? null : (
          <div>
            <label htmlFor={projectSelectId} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
              プロジェクト{' '}
              {isGuest
                ? <span style={{ color: 'var(--red)' }}>*</span>
                : <span style={{ fontWeight: 500, color: 'var(--text-4)' }}>（任意）</span>}
            </label>
            <select
              id={projectSelectId}
              className="form-control"
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              required={isGuest}
              style={{ ...fieldInputStyle(false), color: projectId ? 'var(--text)' : 'var(--text-4)' }}
            >
              {/* ゲストはプロジェクト未所属タスクを作成できないため「プロジェクトなし」を出さない */}
              <option value="" disabled={isGuest}>{isGuest ? 'プロジェクトを選択...' : 'プロジェクトなし'}</option>
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
