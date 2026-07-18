'use client'

import React from 'react'
import { Icon, Avatar, Fab } from '../primitives'
import type { TaskDto } from '@/app/api/tasks/route'
import { CreateTaskModal } from './create-task-modal'
import { TaskEditDialog } from '../task-edit-dialog'
import { RowActionMenu } from '../row-action-menu'
import { useListSelection } from '@/hooks/use-list-selection'
import { useCommand } from '@/lib/command-registry'
import { formatTaskTitleForDisplay } from '@/lib/task-title-display'
import { useTasks, useToggleTaskStatus } from '@/hooks/use-tasks'

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
  onEdit: (task: TaskDto, mode?: 'edit' | 'delete') => void
  toggling: boolean
  selected?: boolean
  index?: number
}

const TaskRow = ({ task, onToggle, onEdit, toggling, selected, index }: TaskRowProps) => {
  const due = formatDueDate(task.dueDate)
  const isDone = task.status === 'done'
  const displayTitle = formatTaskTitleForDisplay(task.title)

  return (
    <div
      data-list-index={index}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px', borderBottom: '1px solid var(--divider)',
        opacity: toggling ? 0.5 : 1, transition: 'opacity .15s',
        background: selected ? 'var(--accent-soft)' : 'transparent',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
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
        }}>{displayTitle}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{task.projectTitle ?? 'プロジェクトなし'}</div>
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

      <RowActionMenu
        actions={[
          { icon: 'edit', label: '編集', onSelect: () => onEdit(task, 'edit') },
          // チャット由来タスクは単体削除不可（元のチャットメッセージ側で削除する）
          ...(task.isLinkedToMessage
            ? []
            : [{ icon: 'trash' as const, label: '削除', danger: true, onSelect: () => onEdit(task, 'delete') }]),
        ]}
        triggerStyle={{ padding: '6px', borderRadius: 8 }}
      />
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
  onEdit: (task: TaskDto, mode?: 'edit' | 'delete') => void
  togglingId: string | null
  open: boolean
  onToggleOpen: () => void
  selectedTaskId?: string | null
  baseIndex?: number
}

const Section = ({ label, count, tasks, onToggle, onEdit, togglingId, open, onToggleOpen, selectedTaskId, baseIndex = 0 }: SectionProps) => {
  return (
    <div>
      <button
        onClick={onToggleOpen}
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
      {open && tasks.map((t, i) => (
        <TaskRow
          key={t.id}
          task={t}
          onToggle={onToggle}
          onEdit={onEdit}
          toggling={togglingId === t.id}
          selected={t.id === selectedTaskId}
          index={baseIndex + i}
        />
      ))}
    </div>
  )
}

// ─── PageTasks ────────────────────────────────────────────────────

export const PageTasks = ({ isMobile = false }: { isMobile?: boolean }) => {
  const [filter, setFilter] = React.useState<FilterKey>('todo')
  const [togglingId, setTogglingId] = React.useState<string | null>(null)
  const [showAddModal, setShowAddModal] = React.useState(false)
  const [editingTask, setEditingTask] = React.useState<TaskDto | null>(null)
  const [dialogMode, setDialogMode] = React.useState<'edit' | 'delete'>('edit')
  // セクション（プロジェクト別）の開閉。明示トグルが無ければ先頭3つを開く
  const [sectionOverride, setSectionOverride] = React.useState<Record<string, boolean>>({})

  // ⌥N: 新規タスク
  useCommand('ctx.create', () => setShowAddModal(true))

  const { data: tasks = [], isLoading } = useTasks()
  const toggleMutation = useToggleTaskStatus()

  const handleToggle = (id: string, current: TaskDto['status']) => {
    const newStatus: TaskDto['status'] = current === 'done' ? 'todo' : 'done'
    setTogglingId(id)
    toggleMutation.mutate({ id, newStatus })
  }

  React.useEffect(() => {
    if (!toggleMutation.isPending) setTogglingId(null)
  }, [toggleMutation.isPending])

  const openEditor = (task: TaskDto, mode: 'edit' | 'delete' = 'edit') => {
    setDialogMode(mode)
    setEditingTask(task)
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
      // プロジェクト未所属タスクは 'none' キーでまとめる
      const key = t.projectId ?? 'none'
      if (!projectMap.has(key)) {
        projectMap.set(key, [])
        projectOrder.push(key)
      }
      projectMap.get(key)!.push(t)
    }
    return projectOrder.map(pid => ({
      key: pid,
      label: projectMap.get(pid)![0]!.projectTitle ?? 'プロジェクトなし',
      tasks: projectMap.get(pid)!,
    }))
  }, [filtered])

  // セクションの開閉（明示トグルが無ければ先頭3つを開く）と、実際に見えているタスク列
  const isSectionOpen = React.useCallback(
    (key: string, idx: number) => sectionOverride[key] ?? idx < 3,
    [sectionOverride],
  )
  const visibleTasks = React.useMemo(
    () => grouped.flatMap((g, idx) => (isSectionOpen(g.key, idx) ? g.tasks : [])),
    [grouped, isSectionOpen],
  )
  // 各セクションの可視タスク列における開始インデックス（scroll-into-view 用）
  const sectionBases = React.useMemo(() => {
    const bases: number[] = []
    let cursor = 0
    grouped.forEach((g, idx) => { bases[idx] = cursor; if (isSectionOpen(g.key, idx)) cursor += g.tasks.length })
    return bases
  }, [grouped, isSectionOpen])

  // 矢印選択は「見えている行」だけを対象にする（折りたたみ内の行は選べない）
  const { selectedIndex: navIdx, setSelectedIndex: setNavIdx } = useListSelection({ count: visibleTasks.length })
  React.useEffect(() => { setNavIdx(-1) }, [filter, setNavIdx])
  const selectedTaskId = navIdx >= 0 ? (visibleTasks[navIdx]?.id ?? null) : null

  const filters: { id: FilterKey; label: string }[] = [
    { id: 'todo',        label: `未着手 (${counts.todo})` },
    { id: 'in_progress', label: `進行中 (${counts.in_progress})` },
    { id: 'done',        label: `完了 (${counts.done})` },
    { id: 'all',         label: `すべて (${counts.all})` },
  ]

  // ⌥[ / ⌥]: フィルタタブ切替
  const cycleFilterTab = (dir: 'prev' | 'next') => {
    const idx = filters.findIndex(f => f.id === filter)
    const next = dir === 'next' ? (idx + 1) % filters.length : (idx - 1 + filters.length) % filters.length
    setFilter(filters[next]!.id)
  }
  useCommand('ctx.filterTabPrev', () => cycleFilterTab('prev'))
  useCommand('ctx.filterTabNext', () => cycleFilterTab('next'))

  // ⌥Enter: 選択中（↑↓）のタスクをトグル。トグル中（PATCH 未完了）は無視して多重発火を防ぐ
  useCommand('tasks.toggle', () => {
    if (togglingId) return
    const task = navIdx >= 0 ? visibleTasks[navIdx] : undefined
    if (task) handleToggle(task.id, task.status)
  })

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
                onEdit={openEditor}
                togglingId={togglingId}
                open={isSectionOpen(g.key, idx)}
                onToggleOpen={() => setSectionOverride(prev => ({ ...prev, [g.key]: !isSectionOpen(g.key, idx) }))}
                selectedTaskId={selectedTaskId}
                baseIndex={sectionBases[idx] ?? 0}
              />
            ))}
          </div>
        )}
      </div>

      {isMobile && <Fab onClick={() => setShowAddModal(true)} label="タスクを追加"/>}
      {showAddModal && <CreateTaskModal onClose={() => setShowAddModal(false)} />}
      <TaskEditDialog open={editingTask != null} task={editingTask} initialMode={dialogMode} onClose={() => setEditingTask(null)} />
    </div>
  )
}
