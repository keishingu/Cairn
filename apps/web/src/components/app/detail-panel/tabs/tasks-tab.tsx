'use client'

import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon, Avatar } from '../../primitives'
import type { ProjectDto } from '@/app/api/projects/route'
import type { TaskDto } from '@/app/api/tasks/route'

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
  const queryClient = useQueryClient()

  const { data: tasks = [], isLoading } = useQuery<TaskDto[]>({
    queryKey: ['tasks', project.id],
    queryFn: () => fetch(`/api/tasks?projectId=${project.id}`).then(r => r.json()),
  })

  const [togglingId, setTogglingId] = React.useState<string | null>(null)

  const toggleMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: TaskDto['status'] }) => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error('Failed')
    },
    onMutate: async ({ id, newStatus }) => {
      setTogglingId(id)
      await queryClient.cancelQueries({ queryKey: ['tasks', project.id] })
      const prev = queryClient.getQueryData<TaskDto[]>(['tasks', project.id])
      queryClient.setQueryData<TaskDto[]>(
        ['tasks', project.id],
        old => old?.map(t => t.id === id ? { ...t, status: newStatus } : t) ?? [],
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['tasks', project.id], ctx.prev)
    },
    onSettled: () => {
      setTogglingId(null)
      queryClient.invalidateQueries({ queryKey: ['tasks', project.id] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const handleToggle = (task: TaskDto) => {
    const newStatus: TaskDto['status'] = task.status === 'done' ? 'todo' : 'done'
    toggleMutation.mutate({ id: task.id, newStatus })
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
                  {t.assigneeName && <Avatar name={t.assigneeName} size={20} />}
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
                  {t.assigneeName && <Avatar name={t.assigneeName} size={20} />}
                </div>
              ))}
            </>
          )}
        </>
      )}
      <button style={{
        marginTop: 12, width: '100%', padding: '9px',
        borderRadius: 8, border: '1px dashed var(--border-2)',
        background: 'transparent', color: 'var(--text-3)',
        fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        <Icon name="plus" size={13} /> タスクを追加
      </button>
    </div>
  )
}
