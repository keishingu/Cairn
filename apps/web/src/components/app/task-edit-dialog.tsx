'use client'

import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog } from './confirm-dialog'
import { TaskDialog } from './task-dialog'
import { TaskFormFields } from './task-form-fields'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { formatTaskTitleForDisplay } from '@/lib/task-title-display'
import type { TaskDto } from '@/app/api/tasks/route'

interface TaskEditDialogProps {
  open: boolean
  task: TaskDto | null
  onClose: () => void
  initialMode?: 'edit' | 'delete'
}

export const TaskEditDialog = ({ open, task, onClose, initialMode = 'edit' }: TaskEditDialogProps) => {
  const queryClient = useQueryClient()
  const [title, setTitle] = React.useState('')
  const [priority, setPriority] = React.useState<TaskDto['priority']>('medium')
  const [dueDate, setDueDate] = React.useState('')
  const [assigneeId, setAssigneeId] = React.useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  React.useEffect(() => {
    if (!open || !task) return
    setTitle(task.title)
    setPriority(task.priority)
    setDueDate(task.dueDate ?? '')
    setAssigneeId(task.assigneeId ?? null)
  }, [open, task])

  React.useEffect(() => {
    if (!open || !task) return
    setConfirmDelete(initialMode === 'delete')
  }, [initialMode, open, task])

  const updateMutation = useMutation({
    mutationFn: async (payload: { title: string; priority: TaskDto['priority']; dueDate: string | null; assigneeId: string | null }) => {
      if (!task) throw new Error('Task not found')
      const res = await fetchWithAuth(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'タスクの更新に失敗しました')
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        task ? queryClient.invalidateQueries({ queryKey: ['tasks', task.projectId] }) : Promise.resolve(),
      ])
      onClose()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!task) throw new Error('Task not found')
      const res = await fetchWithAuth(`/api/tasks/${task.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'タスクの削除に失敗しました')
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        task ? queryClient.invalidateQueries({ queryKey: ['tasks', task.projectId] }) : Promise.resolve(),
      ])
      setConfirmDelete(false)
      onClose()
    },
  })

  if (!open || !task) return null

  const showEditDialog = initialMode !== 'delete'
  const handleDeleteDialogClose = () => {
    if (initialMode === 'delete') {
      onClose()
      return
    }
    setConfirmDelete(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    updateMutation.mutate({
      title: title.trim(),
      priority,
      dueDate: dueDate || null,
      assigneeId,
    })
  }

  const titleChanged = task.title !== title.trim()
  const chatLinkedNote = task.isLinkedToMessage ? (
    <div style={{
      marginTop: 6,
      fontSize: 11.5,
      lineHeight: 1.5,
      color: titleChanged ? 'var(--amber-text)' : 'var(--text-3)',
    }}>
      {titleChanged
        ? 'このタスクはチャットメッセージから作成されています。タイトルを変更すると、元のチャットのチェックボックスも同じ文言に書き換わります。'
        : 'このタスクはチャットメッセージと紐付いています。タイトルを変更すると元のチャットのチェックボックスも書き換わります。'}
    </div>
  ) : null

  const errorMessage = updateMutation.isError
    ? updateMutation.error instanceof Error
      ? updateMutation.error.message
      : 'タスクの更新に失敗しました。'
    : undefined

  return (
    <>
      {showEditDialog && (
        <TaskDialog
          title="タスクを編集"
          subtitle={task.projectTitle ?? 'プロジェクトなし'}
          onClose={onClose}
          onSubmit={handleSubmit}
          submitLabel="保存"
          submittingLabel="保存中..."
          isSubmitting={updateMutation.isPending}
          submitDisabled={!title.trim() || deleteMutation.isPending}
          {...(task.isLinkedToMessage
            ? {}
            : {
                leadingAction: {
                  label: '削除',
                  className: 'btn btn-danger',
                  onClick: () => setConfirmDelete(true),
                  disabled: updateMutation.isPending || deleteMutation.isPending,
                },
              })}
          disableClose={updateMutation.isPending || deleteMutation.isPending}
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
            assigneeProjectId={task.projectId}
            {...(chatLinkedNote ? { titleNote: chatLinkedNote } : {})}
          />
        </TaskDialog>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="タスクを削除しますか？"
        message={`「${formatTaskTitleForDisplay(task.title)}」を削除します。この操作は元に戻せません。`}
        onClose={handleDeleteDialogClose}
        onConfirm={async () => { await deleteMutation.mutateAsync() }}
      />
    </>
  )
}
