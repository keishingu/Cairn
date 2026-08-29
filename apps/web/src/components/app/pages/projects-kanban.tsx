'use client'

import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../primitives'
import { KanbanBoard } from '../kanban'
import { MobileHeader } from '@/components/app/mobile/header'
import { CreateProjectSheet } from '../mobile/create-project-sheet'
import { PageToolbar } from './page-toolbar'
import { CreateProjectModal } from './create-project-modal'
import { FilterPopover } from './filter-popover'
import { useWorkspacePermissions } from '@/hooks/use-current-user'
import { useProjectLabel } from '@/lib/use-workspace-settings'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { useCommand } from '@/lib/command-registry'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { ProjectDto } from '@/app/api/projects/route'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'

interface PageKanbanProps {
  openPanel: (project?: ProjectDto) => void
  isMobile?: boolean
}

export const PageKanban = ({ openPanel, isMobile = false }: PageKanbanProps) => {
  const queryClient = useQueryClient()
  const projectLabel = useProjectLabel()
  const { isAdmin: canCreateProject } = useWorkspacePermissions()
  const [showCreate, setShowCreate] = React.useState(false)

  // ⌥N: 新規プロジェクト / ⌥F: フィルタトグル
  useCommand('ctx.create', () => {
    if (canCreateProject) setShowCreate(true)
  })
  useCommand('ctx.filter', () => setFilterOpen(o => !o))

  const [filterOpen, setFilterOpen] = React.useState(false)
  const [statusFilter, setStatusFilter] = React.useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.kanban_status_filter) ?? '[]') } catch { return [] }
  })
  const setStatusFilterPersisted = (v: string[]) => {
    setStatusFilter(v)
    localStorage.setItem(STORAGE_KEYS.kanban_status_filter, JSON.stringify(v))
  }
  const [memberFilter, setMemberFilter] = React.useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.kanban_member_filter) ?? '[]') } catch { return [] }
  })
  const setMemberFilterPersisted = (v: string[]) => {
    setMemberFilter(v)
    localStorage.setItem(STORAGE_KEYS.kanban_member_filter, JSON.stringify(v))
  }

  const filterBtnRef = React.useRef<HTMLDivElement>(null)

  const { data: allStatuses = [] } = useQuery<ProjectStatusDto[]>({
    queryKey: ['statuses'],
    queryFn: () => fetchWithAuth('/api/projects/statuses').then(r => r.json()),
  })
  const { data: projects = [] } = useQuery<ProjectDto[]>({
    queryKey: ['projects'],
    queryFn: () => fetchWithAuth('/api/projects').then(r => r.json()),
  })

  const allMembers = React.useMemo(
    () => [...new Set(projects.flatMap(p => p.memberNames))].sort(),
    [projects],
  )

  const handleCreated = (project: ProjectDto) => {
    queryClient.setQueryData<ProjectDto[]>(['projects'], prev => [project, ...(prev ?? [])])
    setShowCreate(false)
  }

  const projectFilter = React.useCallback(
    (p: ProjectDto) => memberFilter.length === 0 || memberFilter.some(m => p.memberNames.includes(m)),
    [memberFilter],
  )

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)' }}>
        {showCreate && (
          <CreateProjectSheet
            onClose={() => setShowCreate(false)}
            onCreated={(project) => {
              setShowCreate(false)
              openPanel(project)
            }}
          />
        )}
        <MobileHeader
          title="カンバン"
          right={(
            canCreateProject ? (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                aria-label={`新規${projectLabel}`}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8,
                  flexShrink: 0,
                }}
              >
                <Icon name="plus" size={20} strokeWidth={2.4} />
              </button>
            ) : undefined
          )}
        />
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
        right={
          <>
            <div ref={filterBtnRef} style={{ position: 'relative' }}>
              <button
                className="btn"
                onClick={() => setFilterOpen(o => !o)}
                style={(statusFilter.length + memberFilter.length) > 0 ? { borderColor: 'var(--accent)', color: 'var(--accent-text)', background: 'var(--accent-soft)' } : {}}
              >
                <Icon name="filter" size={13} /> フィルター
                {(statusFilter.length + memberFilter.length) > 0 && (
                  <span style={{ marginLeft: 4, background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 999, fontSize: 10, fontWeight: 700, padding: '1px 5px' }}>
                    {statusFilter.length + memberFilter.length}
                  </span>
                )}
              </button>
              {filterOpen && (
                <FilterPopover
                  containerRef={filterBtnRef}
                  allStatuses={allStatuses} selected={statusFilter} onChange={setStatusFilterPersisted}
                  allMembers={allMembers} selectedMembers={memberFilter} onChangeMembers={setMemberFilterPersisted}
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
