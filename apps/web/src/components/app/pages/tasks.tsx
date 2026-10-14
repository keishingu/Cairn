'use client'

import React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Icon, Avatar, Fab } from '../primitives'
import type { TaskDto } from '@/app/api/tasks/route'
import { CreateTaskModal } from './create-task-modal'
import { TaskDeleteDialog } from '../task-delete-dialog'
import { TaskDetailPanel } from '../task-detail-panel'
import { RowActionMenu } from '../row-action-menu'
import { SegmentedControl } from './page-toolbar'
import { useListSelection } from '@/hooks/use-list-selection'
import { useCommand } from '@/lib/command-registry'
import { formatTaskTitleForDisplay } from '@/lib/task-title-display'
import { taskScopeLabel } from '@/lib/tasks/scope-label'
import { useTasks, useToggleTaskStatus } from '@/hooks/use-tasks'
import { useCurrentUser } from '@/hooks/use-current-user'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { InlineError } from '../inline-error'
import { useT } from '@/components/locale-provider'

type FilterKey = 'all' | 'todo' | 'in_progress' | 'done'
type ScopeKey = 'mine' | 'all'

const FILTER_KEYS: FilterKey[] = ['todo', 'in_progress', 'done', 'all']
const SCOPE_KEYS: ScopeKey[] = ['mine', 'all']

// タブの選択は他ページ（カンバン等）と同じく localStorage に端末ごとに保存する。保存値が無い・不正なら既定値。
function loadStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const value = localStorage.getItem(key)
    return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
  } catch {
    return fallback
  }
}

function storeValue(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* 保存できなくても表示は切り替える */ }
}

const STATUS_LABEL: Record<TaskDto['status'], string> = {
  todo: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
}

const PRIORITY_COLOR: Record<TaskDto['priority'], string> = {
  high: 'var(--red)',
  medium: 'var(--amber)',
  low: 'var(--text-4)',
}

const PRIORITY_LABEL: Record<TaskDto['priority'], string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

function formatDueDate(
  dueDate: string | null,
  t: (message: string, values?: Record<string, string | number>) => string,
): { label: string; overdue: boolean } | null {
  if (!dueDate) return null
  const due = new Date(dueDate + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  const overdue = diff < 0
  const label = diff === 0 ? t('Today') : diff === 1 ? t('Tomorrow') : diff < 0 ? t('{count} days overdue', { count: Math.abs(diff) }) : t('In {count} days', { count: diff })
  return { label, overdue }
}

// ─── TaskRow ──────────────────────────────────────────────────────

interface TaskRowProps {
  task: TaskDto
  onToggle: (id: string, current: TaskDto['status']) => void
  onOpen: (task: TaskDto) => void
  onDelete: (task: TaskDto) => void
  toggling: boolean
  selected?: boolean
  index?: number
}

const TaskRow = ({ task, onToggle, onOpen, onDelete, toggling, selected, index }: TaskRowProps) => {
  const t = useT()
  const due = formatDueDate(task.dueDate, t)
  const isDone = task.status === 'done'
  const displayTitle = formatTaskTitleForDisplay(task.title)
  // チャット由来タスクは、詳細サイドバーと同じく出典メッセージへ戻れるようにする。
  const sourceMessageHref = task.sourceMessageId && task.channelId
    ? `/chats/${encodeURIComponent(task.channelId)}?m=${encodeURIComponent(task.sourceMessageId)}`
    : null

  return (
    // 行のどこを押しても詳細を開く。チェック丸・💬リンク・…メニューは自分の操作だけを行い、行の onClick へ伝えない
    <div
      data-list-index={index}
      onClick={() => onOpen(task)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px', borderBottom: '1px solid var(--divider)',
        opacity: toggling ? 0.5 : 1, transition: 'opacity .15s',
        background: selected ? 'var(--accent-soft)' : 'transparent',
        cursor: 'pointer',
      }}
      className={!selected ? 'hover-bg' : undefined}
    >
      <button
        onClick={e => { e.stopPropagation(); onToggle(task.id, task.status) }}
        disabled={toggling}
        aria-label={isDone ? t('Mark task as not done') : t('Mark task as done')}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          {/* キーボードで Tab 移動した人も詳細を開けるよう、タイトルは button にする（開く処理は行の onClick が受ける） */}
          <button type="button" style={{
            fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', textAlign: 'left',
            padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
            minWidth: 0,
            color: isDone ? 'var(--text-3)' : 'var(--text)',
            textDecoration: isDone ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{displayTitle}</button>
          {task.hasDescription && (
            <span
              title={t('Has a description')}
              aria-label={t('Has a description')}
              style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--text-4)' }}
            >
              <Icon name="file-text" size={12}/>
            </span>
          )}
          {sourceMessageHref && (
            <Link
              href={sourceMessageHref}
              onClick={e => e.stopPropagation()}
              title={t('Go to the message that created this task')}
              aria-label={t('Go to the message that created this task')}
              style={{ display: 'inline-flex', flexShrink: 0, padding: 2, borderRadius: 4, color: 'var(--text-4)' }}
            >
              <Icon name="chat" size={12}/>
            </Link>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{taskScopeLabel(task, t)}</div>
      </div>

      {task.priority && !isDone && (
        <span style={{
          fontSize: 10.5, fontWeight: 700,
          color: PRIORITY_COLOR[task.priority],
          padding: '2px 7px', borderRadius: 4, background: 'var(--card-2)',
          flexShrink: 0,
        }}>{t(PRIORITY_LABEL[task.priority])}</span>
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
        }}>{t('In progress')}</span>
      )}

      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexShrink: 0 }}>
        <RowActionMenu
          actions={[
            { icon: 'eye', label: t('Open details'), onSelect: () => onOpen(task) },
            { icon: 'trash' as const, label: t('Delete'), danger: true, onSelect: () => onDelete(task) },
          ]}
          triggerStyle={{ padding: '6px', borderRadius: 8 }}
        />
      </div>
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
  onOpen: (task: TaskDto) => void
  onDelete: (task: TaskDto) => void
  togglingId: string | null
  open: boolean
  onToggleOpen: () => void
  selectedTaskId?: string | null
  baseIndex?: number
}

const Section = ({ label, count, tasks, onToggle, onOpen, onDelete, togglingId, open, onToggleOpen, selectedTaskId, baseIndex = 0 }: SectionProps) => {
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
          onOpen={onOpen}
          onDelete={onDelete}
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
  const t = useT()
  const searchParams = useSearchParams()
  const openedTaskIdRef = React.useRef<string | null>(null)
  const [filter, setFilterState] = React.useState<FilterKey>(() => loadStored(STORAGE_KEYS.tasks_status_filter, FILTER_KEYS, 'todo'))
  const setFilter = (next: FilterKey) => { setFilterState(next); storeValue(STORAGE_KEYS.tasks_status_filter, next) }
  // 既定は自分が担当のタスク（ページ名も「マイタスク」）
  const [scope, setScopeState] = React.useState<ScopeKey>(() => loadStored(STORAGE_KEYS.tasks_scope, SCOPE_KEYS, 'mine'))
  const setScope = (next: ScopeKey) => { setScopeState(next); storeValue(STORAGE_KEYS.tasks_scope, next) }
  const [togglingId, setTogglingId] = React.useState<string | null>(null)
  const [showAddModal, setShowAddModal] = React.useState(false)
  const [detailTaskId, setDetailTaskId] = React.useState<string | null>(null)
  const [deletingTask, setDeletingTask] = React.useState<TaskDto | null>(null)
  // セクション（プロジェクト別）の開閉。明示トグルが無ければ先頭3つを開く
  const [sectionOverride, setSectionOverride] = React.useState<Record<string, boolean>>({})

  // ⌥N: 新規タスク
  useCommand('ctx.create', () => setShowAddModal(true))

  const { data: allTasks = [], isLoading: tasksLoading } = useTasks()
  const currentUser = useCurrentUser()
  const myUserId = currentUser.data?.id
  // 「自分の担当」は自分の ID が分かるまで絞り込めないので、取得中はローディング、失敗はエラーを出す（全件で代替しない）
  const isLoading = tasksLoading || (scope === 'mine' && currentUser.isLoading)
  const tasks = React.useMemo(
    () => (scope === 'mine' ? (myUserId ? allTasks.filter(task => task.assigneeId === myUserId) : []) : allTasks),
    [allTasks, scope, myUserId],
  )
  const toggleMutation = useToggleTaskStatus()

  // ナッジの「タスクを開く」から対象を1タップで詳細パネルまで開く。
  // 一覧に無くても（フィルター外・取得前でも）詳細を直接取得するので、存在しなければパネルにエラーが出る。
  React.useEffect(() => {
    const taskId = searchParams.get('taskId')
    // taskId だけで判定すると、閉じた後に同じタスクを開き直す要求（アプリは open を変えて送る）を無視してしまう
    const requestKey = searchParams.toString()
    if (!taskId || openedTaskIdRef.current === requestKey) return
    openedTaskIdRef.current = requestKey
    setDetailTaskId(taskId)
  }, [searchParams])

  const handleToggle = (id: string, current: TaskDto['status']) => {
    const newStatus: TaskDto['status'] = current === 'done' ? 'todo' : 'done'
    setTogglingId(id)
    toggleMutation.mutate({ id, newStatus })
  }

  React.useEffect(() => {
    if (!toggleMutation.isPending) setTogglingId(null)
  }, [toggleMutation.isPending])


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
      const key = t.projectId ? `project:${t.projectId}` : t.channelId ? `channel:${t.channelId}` : 'none'
      if (!projectMap.has(key)) {
        projectMap.set(key, [])
        projectOrder.push(key)
      }
      projectMap.get(key)!.push(t)
    }
    return projectOrder.map(pid => ({
      key: pid,
      label: taskScopeLabel(projectMap.get(pid)![0]!, t),
      tasks: projectMap.get(pid)!,
    }))
  }, [filtered, t])

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
  const { selectedIndex: navIdx, setSelectedIndex: setNavIdx } = useListSelection({
    count: visibleTasks.length,
    onEnter: index => {
      const task = visibleTasks[index]
      if (task) openDetail(task)
    },
  })
  React.useEffect(() => { setNavIdx(-1) }, [filter, scope, setNavIdx])
  const selectedTaskId = navIdx >= 0 ? (visibleTasks[navIdx]?.id ?? null) : null

  function openDetail(task: TaskDto) {
    // 開いたあとの Enter が詳細パネル内のボタン操作を横取りしないよう、キーボード選択は解除する
    setNavIdx(-1)
    setDetailTaskId(task.id)
  }

  const filters: { id: FilterKey; label: string }[] = [
    { id: 'todo',        label: t('Not started ({count})', { count: counts.todo }) },
    { id: 'in_progress', label: t('In progress ({count})', { count: counts.in_progress }) },
    { id: 'done',        label: t('Done ({count})', { count: counts.done }) },
    { id: 'all',         label: t('All ({count})', { count: counts.all }) },
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
        <div role="group" aria-label={t('Task scope')} style={{ flexShrink: 0 }}>
          <SegmentedControl
            options={[
              { id: 'mine', label: t('Assigned to me') },
              { id: 'all', label: t('Everyone') },
            ]}
            value={scope}
            onChange={next => setScope(next as ScopeKey)}
          />
        </div>
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
              {t('Add a task')}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: isMobile ? 'calc(80px + env(safe-area-inset-bottom))' : undefined }}>
        {scope === 'mine' && currentUser.isError ? (
          <div style={{ margin: isMobile ? '12px' : '16px 20px' }}>
            <InlineError>{currentUser.error instanceof Error ? currentUser.error.message : t('Could not load your user info')}</InlineError>
          </div>
        ) : isLoading ? (
          <div className="card" style={{ margin: isMobile ? '12px' : '16px 20px', borderRadius: 10, overflow: 'hidden' }}>
            {Array.from({ length: 6 }).map((_, i) => <TaskRowSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 12, color: 'var(--text-3)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)' }}>
              <Icon name="check" size={22} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t('No tasks')}</div>
            <div style={{ fontSize: 12.5 }}>
              {filter === 'all' ? t('Try adding a task') : t('No tasks in "{status}"', { status: t(STATUS_LABEL[filter as TaskDto['status']]) })}
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
                onOpen={openDetail}
                onDelete={setDeletingTask}
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

      {isMobile && <Fab onClick={() => setShowAddModal(true)} label={t('Add a task')}/>}
      {showAddModal && <CreateTaskModal onClose={() => setShowAddModal(false)} />}
      {detailTaskId && <TaskDetailPanel taskId={detailTaskId} isMobile={isMobile} onClose={() => setDetailTaskId(null)} />}
      <TaskDeleteDialog task={deletingTask} onClose={() => setDeletingTask(null)} />
    </div>
  )
}
