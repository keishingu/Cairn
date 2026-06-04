'use client'

import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../primitives'
import { KanbanBoard } from '../kanban'
import { MobileHeader } from '@/components/app/mobile/header'
import { PageToolbar } from './page-toolbar'
import { CreateProjectModal, FilterPopover } from './project-list'
import { useProjectLabel } from '@/lib/use-workspace-settings'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { ProjectDto } from '@/app/api/projects/route'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'

type KanbanScope = 'all' | 'mine' | 'owned'

const SCOPE_LABELS: Record<KanbanScope, string> = {
  all:   'すべてのプロジェクト',
  mine:  '参加中',
  owned: '主催',
}

interface PageKanbanProps {
  openPanel: (project?: ProjectDto) => void
  isMobile?: boolean
}

export const PageKanban = ({ openPanel, isMobile = false }: PageKanbanProps) => {
  const queryClient = useQueryClient()
  const projectLabel = useProjectLabel()
  const [showCreate, setShowCreate] = React.useState(false)
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [scopeOpen, setScopeOpen] = React.useState(false)
  const [statusFilter, setStatusFilter] = React.useState<string[]>([])
  const [scope, setScope] = React.useState<KanbanScope>('all')

  const filterBtnRef = React.useRef<HTMLDivElement>(null)
  const scopeBtnRef = React.useRef<HTMLDivElement>(null)

  const { data: allStatuses = [] } = useQuery<ProjectStatusDto[]>({
    queryKey: ['statuses'],
    queryFn: () => fetchWithAuth('/api/projects/statuses').then(r => r.json()),
  })

  const handleCreated = (project: ProjectDto) => {
    queryClient.setQueryData<ProjectDto[]>(['projects'], prev => [...(prev ?? []), project])
    setShowCreate(false)
  }

  const projectFilter = React.useCallback(
    (p: ProjectDto) => {
      if (scope === 'mine') return !!p.isMember
      if (scope === 'owned') return !!p.isOwner
      return true
    },
    [scope],
  )

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)' }}>
        <MobileHeader title="カンバン" />
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <KanbanBoard onCardClick={openPanel} isMobile />
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '20px 24px', overflow: 'hidden' }}>
      {showCreate && (
        <CreateProjectModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
      <PageToolbar
        style={{ marginBottom: 14 }}
        left={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* グループ: 現状はステータスのみ対応のため非インタラクティブ表示 */}
            <div className="btn" style={{ cursor: 'default', color: 'var(--text-3)', userSelect: 'none' }}>
              グループ: ステータス
            </div>
            <div ref={scopeBtnRef} style={{ position: 'relative' }}>
              <button
                className="btn"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...(scope !== 'all' ? { borderColor: 'var(--accent)', color: 'var(--accent-text)', background: 'var(--accent-soft)' } : {}) }}
                onClick={() => setScopeOpen(o => !o)}
              >
                {SCOPE_LABELS[scope]} <Icon name="chevDown" size={13} />
              </button>
              {scopeOpen && (
                <ScopePopover
                  containerRef={scopeBtnRef}
                  current={scope}
                  onSelect={(s) => { setScope(s); setScopeOpen(false) }}
                  onClose={() => setScopeOpen(false)}
                />
              )}
            </div>
          </div>
        }
        right={
          <>
            <div ref={filterBtnRef} style={{ position: 'relative' }}>
              <button
                className="btn"
                onClick={() => setFilterOpen(o => !o)}
                style={statusFilter.length > 0 ? { borderColor: 'var(--accent)', color: 'var(--accent-text)', background: 'var(--accent-soft)' } : {}}
              >
                <Icon name="filter" size={13} /> フィルター
                {statusFilter.length > 0 && (
                  <span style={{ marginLeft: 4, background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 999, fontSize: 10, fontWeight: 700, padding: '1px 5px' }}>
                    {statusFilter.length}
                  </span>
                )}
              </button>
              {filterOpen && (
                <FilterPopover
                  allStatuses={allStatuses}
                  selected={statusFilter}
                  onChange={setStatusFilter}
                  onClose={() => setFilterOpen(false)}
                />
              )}
            </div>
<button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Icon name="plus" size={13} /> 新規{projectLabel}
            </button>
          </>
        }
      />
      <div style={{ flex: 1, minHeight: 0 }}>
        <KanbanBoard
          onCardClick={openPanel}
          statusFilter={statusFilter}
          projectFilter={projectFilter}
        />
      </div>
    </div>
  )
}

interface ScopePopoverProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  current: KanbanScope
  onSelect: (scope: KanbanScope) => void
  onClose: () => void
}

const ScopePopover = ({ containerRef, current, onSelect, onClose }: ScopePopoverProps) => {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        containerRef.current && !containerRef.current.contains(e.target as Node)
      ) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [containerRef, onClose])

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', left: 0, marginTop: 4,
      width: 180, background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 200, padding: 6,
    }}>
      {(Object.entries(SCOPE_LABELS) as [KanbanScope, string][]).map(([id, label]) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '7px 10px', border: 'none', borderRadius: 6,
            background: current === id ? 'var(--card-2)' : 'transparent',
            color: current === id ? 'var(--text)' : 'var(--text-2)',
            fontSize: 13, fontWeight: current === id ? 600 : 400,
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          }}
        >
          {current === id && <Icon name="check" size={12} />}
          {current !== id && <span style={{ width: 12 }} />}
          {label}
        </button>
      ))}
    </div>
  )
}
