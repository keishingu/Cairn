'use client'

import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, ModalHeader, fieldInputStyle } from './primitives'
import { ConfirmDialog } from './confirm-dialog'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { TaskDto } from '@/app/api/tasks/route'

interface TaskEditDialogProps {
  open: boolean
  task: TaskDto | null
  onClose: () => void
}

export const TaskEditDialog = ({ open, task, onClose }: TaskEditDialogProps) => {
  const queryClient = useQueryClient()
  const [title, setTitle] = React.useState('')
  const [priority, setPriority] = React.useState<TaskDto['priority']>('medium')
  const [dueDate, setDueDate] = React.useState('')
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  React.useEffect(() => {
    if (!open || !task) return
    setTitle(task.title)
    setPriority(task.priority)
    setDueDate(task.dueDate ?? '')
  }, [open, task])

  const updateMutation = useMutation({
    mutationFn: async (payload: { title: string; priority: TaskDto['priority']; dueDate: string | null }) => {
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
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        task ? queryClient.invalidateQueries({ queryKey: ['tasks', task.projectId] }) : Promise.resolve(),
      ])
      setConfirmDelete(false)
      onClose()
    },
  })

  if (!open || !task) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    updateMutation.mutate({
      title: title.trim(),
      priority,
      dueDate: dueDate || null,
    })
  }

  return (
    <>
      <Modal onClose={() => !updateMutation.isPending && onClose()}>
        <div style={{
          position: 'relative',
          background: 'var(--card)', borderRadius: 14,
          width: '100%', maxWidth: 480,
          boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeSlideIn .15s ease',
        }}>
          <ModalHeader title="タスクを編集" subtitle={task.projectTitle} onClose={onClose}/>
          <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                タイトル <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                autoFocus
                style={fieldInputStyle(false)}
              />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>優先度</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value as TaskDto['priority'])}
                  style={fieldInputStyle(false)}
                >
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>期限日</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  style={fieldInputStyle(false)}
                />
              </div>
            </div>
            {updateMutation.isError && (
              <div style={{
                fontSize: 12.5, color: 'var(--red-text)', background: 'var(--red-soft)',
                padding: '8px 12px', borderRadius: 6,
              }}>
                {updateMutation.error instanceof Error ? updateMutation.error.message : 'タスクの更新に失敗しました。'}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingTop: 4 }}>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setConfirmDelete(true)}
                disabled={updateMutation.isPending || deleteMutation.isPending}
              >
                削除
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={onClose} className="btn" disabled={updateMutation.isPending || deleteMutation.isPending}>
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!title.trim() || updateMutation.isPending || deleteMutation.isPending}
                >
                  {updateMutation.isPending ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title="タスクを削除しますか？"
        message={`「${task.title}」を削除します。この操作は元に戻せません。`}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => { await deleteMutation.mutateAsync() }}
      />
    </>
  )
}
