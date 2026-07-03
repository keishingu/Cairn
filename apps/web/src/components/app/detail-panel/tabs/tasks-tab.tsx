'use client'

import React from 'react'
import { Icon, Avatar } from '../../primitives'
import type { ProjectDto } from '@/app/api/projects/route'
import type { TaskDto } from '@/app/api/tasks/route'
import { useProjectTasks, useCreateTask } from '@/hooks/use-project-tasks'
import { TaskEditDialog } from '../../task-edit-dialog'
import { RowActionMenu } from '../../row-action-menu'

// ─── AddTaskModal ─────────────────────────────────────────────────

interface AddTaskModalProps {
  project: ProjectDto
  onClose: () => void
}

const AddTaskModal = ({ project, onClose }: AddTaskModalProps) => {
  const [title, setTitle] = React.useState('')
  const [priority, setPriority] = React.useState<TaskDto['priority']>('medium')
  const [dueDate, setDueDate] = React.useState('')

  const mutation = useCreateTask(project.id, onClose)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    mutation.mutate({
      title: title.trim(),
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
    boxSizing: 'border-box', outline: 'none',
  }

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: 0,
      }}
    >
      <div style={{
        background: 'var(--card)', borderRadius: '12px 12px 0 0',
        width: '100%', maxWidth: 520,
        boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
        animation: 'fadeSlideIn .15s ease',
        paddingBottom: 'env(safe-area-inset-bottom)',
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

        {/* Project context */}
        <div style={{ padding: '10px 20px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="folder" size={12} color="var(--text-3)" />
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{project.title}</span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
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

          <div style={{ display: 'flex', gap: 8, paddingTop: 2 }}>
            <button type="button" onClick={onClose} className="btn" style={{ flex: 1, padding: '10px' }}>
              キャンセル
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!title.trim() || mutation.isPending}
              style={{ flex: 2, padding: '10px' }}
            >
              {mutation.isPending ? '追加中...' : '追加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const PRIORITY_COLOR: Record<string, string> = {
  high: 'var(--red)',
  medium: 'var(--amber)',
  low: 'var(--text-4)',
}

const PRIORITY_LABEL: Record<string, string> = { high: '高', medium: '中', low: '低' }

interface TasksTabProps {
  project: ProjectDto
}

export const TasksTab = ({ project }: TasksTabProps) => {
  const [showAddModal, setShowAddModal] = React.useState(false)
  const [editingTask, setEditingTask] = React.useState<TaskDto | null>(null)
  const [dialogMode, setDialogMode] = React.useState<'edit' | 'delete'>('edit')
  const { data: tasks = [], isLoading, toggleMutation } = useProjectTasks(project.id)
  const [togglingId, setTogglingId] = React.useState<string | null>(null)

  const handleToggle = (task: TaskDto) => {
    const newStatus: TaskDto['status'] = task.status === 'done' ? 'todo' : 'done'
    setTogglingId(task.id)
    toggleMutation.mutate(
      { id: task.id, newStatus },
      { onSettled: () => setTogglingId(null) },
    )
  }

  const openEditor = (task: TaskDto, mode: 'edit' | 'delete' = 'edit') => {
    setDialogMode(mode)
    setEditingTask(task)
  }

  if (isLoading) {
    return (
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 16px' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: '1px solid var(--divider)' }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--card-2)', flexShrink: 0 }} />
            <div style={{ flex: 1, height: 12, borderRadius: 4, background: 'var(--card-2)' }} />
          </div>
        ))}
      </div>
    )
  }

  const todoTasks = tasks.filter(t => t.status !== 'done')
  const doneTasks = tasks.filter(t => t.status === 'done')

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 16px' }}>
      {tasks.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 12.5 }}>
          タスクはありません
        </div>
      ) : (
        <>
          {todoTasks.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', padding: '4px 0 6px', letterSpacing: '0.04em' }}>
                未完了 ({todoTasks.length})
              </div>
              {todoTasks.map(t => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 4px', borderBottom: '1px solid var(--divider)',
                  opacity: togglingId === t.id ? 0.5 : 1, transition: 'opacity .15s',
                }}>
                  <button
                    onClick={() => handleToggle(t)}
                    disabled={togglingId === t.id}
                    style={{
                      width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                      border: '1.5px solid var(--border-2)', background: 'transparent',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background .1s, border-color .1s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)' }}
                  />
                  <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text)' }}>{t.title}</span>
                  {t.priority && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: PRIORITY_COLOR[t.priority], padding: '2px 6px', borderRadius: 4, background: 'var(--card-2)' }}>
                      {PRIORITY_LABEL[t.priority]}
                    </span>
                  )}
                  {t.dueDate && <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t.dueDate.slice(5).replace('-', '/')}</span>}
                  {t.assigneeName && <Avatar name={t.assigneeName} url={t.assigneeAvatarUrl} size={20} />}
                  <RowActionMenu
                    actions={[
                      { icon: 'edit', label: '編集', onSelect: () => openEditor(t, 'edit') },
                      { icon: 'trash', label: '削除', danger: true, onSelect: () => openEditor(t, 'delete') },
                    ]}
                    triggerStyle={{ padding: '6px', borderRadius: 8 }}
                  />
                </div>
              ))}
            </>
          )}
          {doneTasks.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', padding: '14px 0 6px', letterSpacing: '0.04em' }}>
                完了 ({doneTasks.length})
              </div>
              {doneTasks.map(t => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 4px', borderBottom: '1px solid var(--divider)',
                  opacity: togglingId === t.id ? 0.5 : 1, transition: 'opacity .15s',
                }}>
                  <button
                    onClick={() => handleToggle(t)}
                    disabled={togglingId === t.id}
                    style={{
                      width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                      border: '1.5px solid var(--accent)', background: 'var(--accent)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--on-accent)',
                    }}
                  >
                    <Icon name="check" size={10} strokeWidth={3} />
                  </button>
                  <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'line-through' }}>{t.title}</span>
                  {t.dueDate && <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t.dueDate.slice(5).replace('-', '/')}</span>}
                  {t.assigneeName && <Avatar name={t.assigneeName} url={t.assigneeAvatarUrl} size={20} />}
                  <RowActionMenu
                    actions={[
                      { icon: 'edit', label: '編集', onSelect: () => openEditor(t, 'edit') },
                      { icon: 'trash', label: '削除', danger: true, onSelect: () => openEditor(t, 'delete') },
                    ]}
                    triggerStyle={{ padding: '6px', borderRadius: 8 }}
                  />
                </div>
              ))}
            </>
          )}
        </>
      )}
      <button
        onClick={() => setShowAddModal(true)}
        style={{
          marginTop: 12, width: '100%', padding: '9px',
          borderRadius: 8, border: '1px dashed var(--border-2)',
          background: 'transparent', color: 'var(--text-3)',
          fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <Icon name="plus" size={13} /> タスクを追加
      </button>

      {showAddModal && <AddTaskModal project={project} onClose={() => setShowAddModal(false)} />}
      <TaskEditDialog open={editingTask != null} task={editingTask} initialMode={dialogMode} onClose={() => setEditingTask(null)} />
    </div>
  )
}
