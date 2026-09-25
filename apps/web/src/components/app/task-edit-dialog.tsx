'use client'

import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog } from './confirm-dialog'
import { TaskDialog } from './task-dialog'
import { TaskFormFields } from './task-form-fields'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { formatTaskTitleForDisplay } from '@/lib/task-title-display'
import type { TaskDto } from '@/app/api/tasks/route'
import { useT } from '@/components/locale-provider'

interface TaskEditDialogProps {
  open: boolean
  task: TaskDto | null
  onClose: () => void
  initialMode?: 'edit' | 'delete'
}

export const TaskEditDialog = ({ open, task, onClose, initialMode = 'edit' }: TaskEditDialogProps) => {
  const t = useT()
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
        throw new Error(d.error ?? t('Could not update the task'))
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
        throw new Error(d.error ?? t('Could not delete the task'))
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
        ? t('This task was created from a chat message. If you posted that message, changing the title also updates the checkbox text in the original chat.')
        : t('This task is linked to a chat message. If you posted that message, changing the title also updates the checkbox text in the original chat.')}
    </div>
  ) : null

  const errorMessage = updateMutation.isError
    ? updateMutation.error instanceof Error
      ? updateMutation.error.message
      : t('Could not update the task.')
    : undefined

  return (
    <>
      {showEditDialog && (
        <TaskDialog
          title={t('Edit task')}
          subtitle={task.projectTitle ?? task.channelName ?? t('No project')}
          onClose={onClose}
          onSubmit={handleSubmit}
          submitLabel={t('Save')}
          submittingLabel={t('Saving…')}
          isSubmitting={updateMutation.isPending}
          submitDisabled={!title.trim() || deleteMutation.isPending}
          {...(task.isLinkedToMessage
            ? {}
            : {
                leadingAction: {
                  label: t('Delete'),
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
            assigneeChannelId={task.channelId}
            assigneeChannelIsPrivate={task.channelIsPrivate}
            {...(task.assigneeId
              ? { currentAssignee: { userId: task.assigneeId, displayName: task.assigneeName ?? t('Unknown member'), avatarUrl: task.assigneeAvatarUrl } }
              : {})}
            {...(chatLinkedNote ? { titleNote: chatLinkedNote } : {})}
          />
        </TaskDialog>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title={t('Delete this task?')}
        message={t('This deletes "{name}". This cannot be undone.', { name: formatTaskTitleForDisplay(task.title) })}
        onClose={handleDeleteDialogClose}
        onConfirm={async () => { await deleteMutation.mutateAsync() }}
      />
    </>
  )
}
