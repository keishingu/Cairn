'use client'

import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon, Avatar, Fab } from '../primitives'
import type { TaskDto } from '@/app/api/tasks/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { CreateTaskModal } from './create-task-modal'

type FilterKey = 'all' | 'todo' | 'in_progress' | 'done'

const STATUS_LABEL: Record<TaskDto['status'], string> = {
  todo: '未着手',
  in_progress: '進行中',
  done: '完了',
}

const PRIORITY_COLOR: Record<TaskDto['priority'], string> = {
  high: 'var(--red)',
  medium: 'var(--amber)',
  low: 'var(--text-4)',
}

const PRIORITY_LABEL: Record<TaskDto['priority'], string> = {
  high: '高',
  medium: '中',
  low: '低',
}

function formatDueDate(dueDate: string | null): { label: string; overdue: boolean } | null {
  if (!dueDate) return null
  const due = new Date(dueDate + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  const overdue = diff < 0
  const label = diff === 0 ? '今日' : diff === 1 ? '明日' : diff < 0 ? `${Math.abs(diff)}日超過` : `${diff}日後`
  return { label, overdue }
}

// ─── TaskRow ──────────────────────────────────────────────────────

interface TaskRowProps {
  task: TaskDto
  onToggle: (id: string, current: TaskDto['status']) => void
  toggling: boolean
}

const TaskRow = ({ task, onToggle, toggling }: TaskRowProps) => {
  const due = formatDueDate(task.dueDate)
  const isDone = task.status === 'done'

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px', borderBottom: '1px solid var(--divider)',
        opacity: toggling ? 0.5 : 1, transition: 'opacity .15s',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--card-2)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
    >
      <button
        onClick={() => onToggle(task.id, task.status)}
        disabled={toggling}
        style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
          border: `1.5px solid ${isDone ? 'var(--accent)' : 'var(--border-2)'}`,
          background: isDone ? 'var(--accent)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--on-accent)', cursor: 'pointer',
          transition: 'background .12s, border-color .12s',
        }}
      >
        {isDone && <Icon name="check" size={10} strokeWidth={3} />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13.5, fontWeight: 500,
          color: isDone ? 'var(--text-3)' : 'var(--text)',
          textDecoration: isDone ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{task.title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{task.projectTitle}</div>
      </div>

      {task.priority && !isDone && (
        <span style={{
          fontSize: 10.5, fontWeight: 700,
          color: PRIORITY_COLOR[task.priority],
          padding: '2px 7px', borderRadius: 4, background: 'var(--card-2)',
          flexShrink: 0,
        }}>{PRIORITY_LABEL[task.priority]}</span>
      )}

      {due && !isDone && (
        <span style={{
          fontSize: 11.5, fontWeight: 500,
          color: due.overdue ? 'var(--red-text)' : 'var(--text-3)',
          background: due.overdue ? 'var(--red-soft)' : 'transparent',
          padding: due.overdue ? '2px 6px' : '0',
          borderRadius: 4, flexShrink: 0,
        }}>{due.label}</span>
      )}

      {task.assigneeName && (
        <Avatar name={task.assigneeName} url={task.assigneeAvatarUrl} size={22} />
      )}

      {task.status === 'in_progress' && (
        <span style={{
          fontSize: 10.5, fontWeight: 700,
          color: 'var(--violet-text)', background: 'var(--violet-soft)',
          padding: '2px 7px', borderRadius: 4, flexShrink: 0,
        }}>進行中</span>
      )}
    </div>
  )
}

const TaskRowSkeleton = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--divider)' }}>
    <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--card-2)', flexShrink: 0 }} />
    <div style={{ flex: 1 }}>
      <div style={{ height: 13, width: '55%', borderRadius: 4, background: 'var(--card-2)', marginBottom: 6 }} />
      <div style={{ height: 11, width: '30%', borderRadius: 4, background: 'var(--card-2)' }} />
    </div>
    <div style={{ height: 22, width: 60, borderRadius: 4, background: 'var(--card-2)' }} />
  </div>
)

// ─── Section ──────────────────────────────────────────────────────

interface SectionProps {
  label: string
  count: number
  tasks: TaskDto[]
  onToggle: (id: string, current: TaskDto['status']) => void
  togglingId: string | null
  defaultOpen?: boolean
}

const Section = ({ label, count, tasks, onToggle, togglingId, defaultOpen = true }: SectionProps) => {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 16px', border: 'none', background: 'var(--card-2)',
          borderBottom: '1px solid var(--divider)', cursor: 'pointer',
          fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <Icon name={open ? 'chevDown' : 'chevRight'} size={12} color="var(--text-3)" />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.02em' }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)', background: 'var(--card)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: 999 }}>{count}</span>
      </button>
      {open && tasks.map(t => (
        <TaskRow
          key={t.id}
          task={t}
          onToggle={onToggle}
          toggling={togglingId === t.id}
        />
      ))}
    </div>
  )
}

// ─── PageTasks ────────────────────────────────────────────────────

export const PageTasks = ({ isMobile = false }: { isMobile?: boolean }) => {
  const queryClient = useQueryClient()
  const [filter, setFilter] = React.useState<FilterKey>('all')
  const [togglingId, setTogglingId] = React.useState<string | null>(null)
  const [showAddModal, setShowAddModal] = React.useState(false)

  // ⌥N: 新規タスク
  React.useEffect(() => {
    const onCreate = () => setShowAddModal(true)
    window.addEventListener('cairn:create', onCreate)
    return () => window.removeEventListener('cairn:create', onCreate)
  }, [])

  const { data: tasks = [], isLoading } = useQuery<TaskDto[]>({
    queryKey: ['tasks'],
    queryFn: () => fetchWithAuth('/api/tasks').then(r => r.json()),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: TaskDto['status'] }) => {
      const res = await fetchWithAuth(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error('Failed to update task')
    },
    onMutate: async ({ id, newStatus }) => {
      setTogglingId(id)
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const prev = queryClient.getQueryData<TaskDto[]>(['tasks'])
      queryClient.setQueryData<TaskDto[]>(
        ['tasks'],
        old => old?.map(t => t.id === id ? { ...t, status: newStatus } : t) ?? [],
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['tasks'], ctx.prev)
    },
    onSettled: () => {
      setTogglingId(null)
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const handleToggle = (id: string, current: TaskDto['status']) => {
    const newStatus: TaskDto['status'] = current === 'done' ? 'todo' : 'done'
    toggleMutation.mutate({ id, newStatus })
  }

  const filtered = React.useMemo(() => {
    if (filter === 'all') return tasks
    return tasks.filter(t => t.status === filter)
  }, [tasks, filter])

  const counts = React.useMemo(() => ({
    all: tasks.length,
    todo: tasks.filter(t => t.status === 'todo').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
  }), [tasks])

  const grouped = React.useMemo(() => {
    const projectOrder: string[] = []
    const projectMap = new Map<string, TaskDto[]>()
    for (const t of filtered) {
      if (!projectMap.has(t.projectId)) {
        projectMap.set(t.projectId, [])
        projectOrder.push(t.projectId)
      }
      projectMap.get(t.projectId)!.push(t)
    }
    return projectOrder.map(pid => ({
      key: pid,
      label: projectMap.get(pid)![0]!.projectTitle,
      tasks: projectMap.get(pid)!,
    }))
  }, [filtered])

  const filters: { id: FilterKey; label: string }[] = [
    { id: 'all',         label: `すべて (${counts.all})` },
    { id: 'todo',        label: `未着手 (${counts.todo})` },
    { id: 'in_progress', label: `進行中 (${counts.in_progress})` },
    { id: 'done',        label: `完了 (${counts.done})` },
  ]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        padding: isMobile ? '8px 12px' : '14px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        overflowX: 'auto',
      }}>
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          {filters.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: isMobile ? '6px 8px' : '6px 10px',
                borderRadius: 6, border: 'none',
                background: filter === f.id ? 'var(--card-hover)' : 'transparent',
                color: filter === f.id ? 'var(--text)' : 'var(--text-3)',
                fontSize: isMobile ? 12 : 12.5, fontWeight: filter === f.id ? 600 : 500,
                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
            >{f.label}</button>
          ))}
        </div>
        {!isMobile && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              className="btn btn-primary"
              onClick={() => setShowAddModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Icon name="plus" size={13} strokeWidth={2.4} />
              タスクを追加
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: isMobile ? 'calc(80px + env(safe-area-inset-bottom))' : undefined }}>
        {isLoading ? (
          <div className="card" style={{ margin: isMobile ? '12px' : '16px 20px', borderRadius: 10, overflow: 'hidden' }}>
            {Array.from({ length: 6 }).map((_, i) => <TaskRowSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 12, color: 'var(--text-3)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)' }}>
              <Icon name="check" size={22} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>タスクはありません</div>
            <div style={{ fontSize: 12.5 }}>
              {filter === 'all' ? 'タスクを追加してみましょう' : `「${STATUS_LABEL[filter as TaskDto['status']]}」のタスクはありません`}
            </div>
          </div>
        ) : (
          <div style={{ margin: isMobile ? '12px' : '16px 20px', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
            {grouped.map((g, idx) => (
              <Section
                key={g.key}
                label={g.label}
                count={g.tasks.length}
                tasks={g.tasks}
                onToggle={handleToggle}
                togglingId={togglingId}
                defaultOpen={idx < 3}
              />
            ))}
          </div>
        )}
      </div>

      {isMobile && <Fab onClick={() => setShowAddModal(true)} label="タスクを追加"/>}
      {showAddModal && <CreateTaskModal onClose={() => setShowAddModal(false)} />}
    </div>
  )
}
