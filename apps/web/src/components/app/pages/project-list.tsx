'use client'

import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { chatQueryKeys } from '@/lib/chat/client'
import { Icon, AvatarStack, StatusChip, MountainPhoto, Fab } from '../primitives'
import type { ProjectDto } from '@/app/api/projects/route'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'
import { MobileHeader } from '../mobile/header'
import { CreateProjectSheet } from '../mobile/create-project-sheet'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { PageToolbar, SegmentedControl } from './page-toolbar'
import { useProjectLabel } from '@/lib/use-workspace-settings'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { CreateProjectModal } from './create-project-modal'
import { FilterPopover } from './filter-popover'
import { useWorkspacePermissions } from '@/hooks/use-current-user'
import { useListSelection } from '@/hooks/use-list-selection'
import { useCommand } from '@/lib/command-registry'

// ─── Main component ───────────────────────────────────────────────
interface ProjectListViewProps {
  openPanel?: (project?: ProjectDto) => void
  isMobile?: boolean
  externalSearch?: string
}

function formatDates(start: string | null, end: string | null): string {
  if (!start) return '—'
  const fmt = (d: string) => {
    const [, m, day] = d.split('-')
    return `${Number(m)}/${Number(day)}`
  }
  return end && end !== start ? `${fmt(start)}–${fmt(end)}` : fmt(start)
}

async function fetchProjects(): Promise<ProjectDto[]> {
  const res = await fetchWithAuth('/api/projects')
  if (!res.ok) throw new Error('fetch failed')
  return res.json() as Promise<ProjectDto[]>
}

async function fetchStatuses(): Promise<ProjectStatusDto[]> {
  const res = await fetchWithAuth('/api/projects/statuses')
  if (!res.ok) throw new Error('fetch failed')
  return res.json() as Promise<ProjectStatusDto[]>
}

export const ProjectListView = ({ openPanel, isMobile, externalSearch }: ProjectListViewProps) => {
  const queryClient = useQueryClient()
  const projectLabel = useProjectLabel()
  const { isAdmin: canCreateProject } = useWorkspacePermissions()
  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects })
  const [view, setView] = React.useState<'grid' | 'table'>(() => {
    if (typeof window === 'undefined') return 'grid'
    const saved = localStorage.getItem(STORAGE_KEYS.projects_list_view)
    return (saved === 'grid' || saved === 'table') ? saved : 'grid'
  })
  const setViewPersisted = (v: 'grid' | 'table') => {
    setView(v)
    localStorage.setItem(STORAGE_KEYS.projects_list_view, v)
  }
  type SortKey = 'title' | 'status' | 'date' | 'progress'
  type SortDir = 'asc' | 'desc'
  const [tableSort, setTableSort] = React.useState<{ key: SortKey; dir: SortDir }>(() => {
    if (typeof window === 'undefined') return { key: 'title', dir: 'asc' }
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.projects_table_sort) ?? 'null')
      if (saved && ['title','status','date','progress'].includes(saved.key) && ['asc','desc'].includes(saved.dir)) return saved
    } catch { /* ignore */ }
    return { key: 'title', dir: 'asc' }
  })
  const setTableSortPersisted = (key: SortKey) => {
    setTableSort(prev => {
      const next = prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' as SortDir : 'asc' as SortDir } : { key, dir: 'asc' as SortDir }
      localStorage.setItem(STORAGE_KEYS.projects_table_sort, JSON.stringify(next))
      return next
    })
  }
  const [filter, setFilterState] = React.useState<string>(() => {
    if (typeof window === 'undefined') return 'all'
    return localStorage.getItem(STORAGE_KEYS.projects_filter) ?? 'all'
  })
  const setFilter = (f: string) => {
    setFilterState(f)
    localStorage.setItem(STORAGE_KEYS.projects_filter, f)
  }
  const [showCreate, setShowCreate] = React.useState(false)
  const [filterOpen, setFilterOpen] = React.useState(false)
  const { data: allStatuses = [] } = useQuery({ queryKey: ['statuses'], queryFn: fetchStatuses })
  const [statusFilter, setStatusFilter] = React.useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.projects_status_filter) ?? '[]') } catch { return [] }
  })
  const setStatusFilterPersisted = (v: string[]) => {
    setStatusFilter(v)
    localStorage.setItem(STORAGE_KEYS.projects_status_filter, JSON.stringify(v))
  }
  const [memberFilter, setMemberFilter] = React.useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.projects_member_filter) ?? '[]') } catch { return [] }
  })
  const setMemberFilterPersisted = (v: string[]) => {
    setMemberFilter(v)
    localStorage.setItem(STORAGE_KEYS.projects_member_filter, JSON.stringify(v))
  }
  const filterBtnRef = React.useRef<HTMLDivElement>(null)
  const [search, setSearch] = React.useState('')
  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false)
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  // ⌥N 新規 / ⌥F フィルタ / ⌥G ⌥T ビュー切替（検索フォーカスは TopBarSearch が担当）
  useCommand('ctx.create', () => { if (canCreateProject) setShowCreate(true) })
  useCommand('ctx.filter', () => setFilterOpen(o => !o))
  useCommand('projects.viewGrid', () => setViewPersisted('grid'))
  useCommand('projects.viewTable', () => setViewPersisted('table'))

  const handleCreated = (project: ProjectDto) => {
    queryClient.setQueryData<ProjectDto[]>(['projects'], prev => [...(prev ?? []), project])
    void queryClient.invalidateQueries({ queryKey: chatQueryKeys.projectChannels })
  }

  const counts = {
    all:      projects.filter(p => !p.archived).length,
    mine:     projects.filter(p => p.isMember && !p.archived).length,
    owned:    projects.filter(p => p.isOwner && !p.archived).length,
    active:   projects.filter(p => !p.archived).length,
    archived: projects.filter(p => p.archived).length,
  }

  const filterTabs = [
    { id: 'all',      label: 'すべて',     n: counts.all },
    { id: 'mine',     label: '参加中',     n: counts.mine },
    { id: 'owned',    label: '主催',       n: counts.owned },
    { id: 'active',   label: '進行中',     n: counts.active },
    { id: 'archived', label: 'アーカイブ', n: counts.archived },
  ]

  // ⌥[ / ⌥]: フィルタタブ切替
  const cycleFilterTab = (dir: 'prev' | 'next') => {
    const idx = filterTabs.findIndex(f => f.id === filter)
    const next = dir === 'next'
      ? (idx + 1) % filterTabs.length
      : (idx - 1 + filterTabs.length) % filterTabs.length
    setFilter(filterTabs[next]!.id)
  }
  useCommand('ctx.filterTabPrev', () => cycleFilterTab('prev'))
  useCommand('ctx.filterTabNext', () => cycleFilterTab('next'))

  const tabFiltered = React.useMemo(() => {
    switch (filter) {
      case 'mine':     return projects.filter(p => p.isMember && !p.archived)
      case 'owned':    return projects.filter(p => p.isOwner && !p.archived)
      case 'active':   return projects.filter(p => !p.archived)
      case 'archived': return projects.filter(p => p.archived)
      default:         return projects.filter(p => !p.archived)
    }
  }, [projects, filter])

  const allMembers = React.useMemo(
    () => [...new Set(projects.flatMap(p => p.memberNames))].sort(),
    [projects],
  )

  const effectiveSearch = isMobile ? search : (externalSearch ?? search)
  const isSearching = effectiveSearch.trim().length > 0

  const filteredProjects = React.useMemo(() => {
    const q = effectiveSearch.trim().toLowerCase()
    if (q) return projects.filter(p => p.title.toLowerCase().includes(q))
    let result = tabFiltered
    if (statusFilter.length > 0) result = result.filter(p => p.statusName !== null && statusFilter.includes(p.statusName))
    if (memberFilter.length > 0) result = result.filter(p => memberFilter.some(m => p.memberNames.includes(m)))
    return result
  }, [tabFiltered, statusFilter, memberFilter, effectiveSearch, projects])

  const sortedProjects = React.useMemo(() => {
    if (view !== 'table') return filteredProjects
    const { key, dir } = tableSort
    return [...filteredProjects].sort((a, b) => {
      let cmp = 0
      if (key === 'title') {
        cmp = a.title.localeCompare(b.title, 'ja')
      } else if (key === 'status') {
        cmp = (a.statusName ?? '').localeCompare(b.statusName ?? '', 'ja')
      } else if (key === 'date') {
        cmp = (a.startDate ?? '').localeCompare(b.startDate ?? '')
      } else if (key === 'progress') {
        const ap = a.taskCount > 0 ? a.completedTaskCount / a.taskCount : 0
        const bp = b.taskCount > 0 ? b.completedTaskCount / b.taskCount : 0
        cmp = ap - bp
      }
      return dir === 'asc' ? cmp : -cmp
    })
  }, [filteredProjects, view, tableSort])

  // 矢印選択・Enter は実際に描画している並び（sortedProjects）を対象にする
  const { selectedIndex: navIdx, setSelectedIndex: setNavIdx } = useListSelection({
    count: sortedProjects.length,
    onEnter: React.useCallback((idx: number) => { openPanel?.(sortedProjects[idx]!) }, [sortedProjects, openPanel]),
  })

  // フィルタ変更で選択をリセット
  React.useEffect(() => { setNavIdx(-1) }, [filter, statusFilter, memberFilter, effectiveSearch, setNavIdx])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      {/* Create modal/sheet */}
      {showCreate && (
        isMobile
          ? <CreateProjectSheet onClose={() => setShowCreate(false)} onCreated={(p) => { handleCreated(p); openPanel?.(p) }}/>
          : <CreateProjectModal onClose={() => setShowCreate(false)} onCreated={handleCreated}/>
      )}

      {/* Mobile header */}
      {isMobile && (
        <>
          <MobileHeader
            title="プロジェクト一覧"
            right={
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => { setMobileSearchOpen(o => !o); setTimeout(() => searchInputRef.current?.focus(), 50) }}
                  style={{ border: 'none', background: mobileSearchOpen ? 'var(--card-hover)' : 'transparent', borderRadius: 8, color: mobileSearchOpen ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer', padding: 4 }}
                >
                  <Icon name="search" size={20}/>
                </button>
              </div>
            }
          />
          {mobileSearchOpen && (
            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)', flexShrink: 0 }}>
              <Icon name="search" size={14} color="var(--text-3)"/>
              <input
                ref={searchInputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="アーカイブを含むすべてのプロジェクトを検索…"
                style={{ flex: 1, fontSize: 13, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', caretColor: 'var(--accent)' }}
                onKeyDown={e => { if (e.key === 'Escape') { setMobileSearchOpen(false); setSearch('') } }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', color: 'var(--text-4)' }}>
                  <Icon name="close" size={12}/>
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Toolbar */}
      <PageToolbar
        style={{
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          padding: isMobile ? '10px 16px' : '0 16px 0 0',
        }}
        left={
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 0, opacity: isSearching ? 0.4 : 1, pointerEvents: isSearching ? 'none' : undefined, transition: 'opacity .15s' }}>
            {filterTabs.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={isMobile ? {
                padding: '6px 14px', borderRadius: 999, border: 'none', flexShrink: 0,
                background: filter === f.id ? 'var(--accent)' : 'var(--card-2)',
                color: filter === f.id ? 'var(--on-accent)' : 'var(--text-3)',
                fontSize: 13, fontWeight: filter === f.id ? 600 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
              } : {
                padding: '10px 14px', border: 'none', background: 'transparent',
                color: filter === f.id ? 'var(--text)' : 'var(--text-3)',
                fontSize: 13, fontWeight: filter === f.id ? 600 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
                borderBottom: filter === f.id ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                whiteSpace: 'nowrap',
              }}>
                {f.label}
                {!isMobile && <span style={{ fontSize: 11, color: 'var(--text-4)', fontWeight: 600 }}>{f.n}</span>}
              </button>
            ))}
          </div>
        }
        right={!isMobile ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0' }}>
            <SegmentedControl
              options={[
                { id: 'grid',  label: 'カード',   icon: <Icon name="kanban" size={12}/> },
                { id: 'table', label: 'テーブル', icon: <Icon name="list"   size={12}/> },
              ]}
              value={view}
              onChange={(v) => setViewPersisted(v as 'grid' | 'table')}
            />
            <div ref={filterBtnRef} style={{ position: 'relative' }}>
              <button
                className="btn"
                onClick={() => setFilterOpen(o => !o)}
                style={(statusFilter.length + memberFilter.length) > 0 ? { borderColor: 'var(--accent)', color: 'var(--accent-text)', background: 'var(--accent-soft)' } : {}}
              >
                <Icon name="filter" size={13}/> フィルター
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
            <button
              className="btn btn-primary"
              onClick={() => setShowCreate(true)}
              disabled={!canCreateProject}
              title={canCreateProject ? undefined : `${projectLabel}の作成には管理者以上の権限が必要です`}
              style={canCreateProject ? {} : { opacity: 0.5, cursor: 'not-allowed' }}
            >
              <Icon name="plus" size={13}/> 新規{projectLabel}
            </button>
          </div>
        ) : undefined}
      />

      {/* Content */}
      <div style={{
        flex: 1, overflow: 'auto',
        padding: isMobile ? '12px 16px' : '20px 24px',
        paddingBottom: isMobile ? 'calc(80px + env(safe-area-inset-bottom))' : undefined,
      }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>読み込み中…</div>
        ) : filteredProjects.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>プロジェクトが見つかりません</div>
        ) : view === 'table' && !isMobile ? (
          /* PC table view */
          <div className="card" style={{ padding: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 120px 120px 120px 100px 32px', gap: 16, padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              <span/>
              {(['title','status','date'] as SortKey[]).map((col) => {
                const labels: Record<SortKey, string> = { title: 'プロジェクト', status: 'ステータス', date: '日程', progress: '進捗' }
                const active = tableSort.key === col
                return (
                  <button key={col} onClick={() => setTableSortPersisted(col)} style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                    color: active ? 'var(--text)' : 'var(--text-3)',
                    display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'inherit',
                  }}>
                    {labels[col]}
                    <span style={{ fontSize: 9, opacity: active ? 1 : 0.35 }}>{active ? (tableSort.dir === 'asc' ? '▲' : '▼') : '▲'}</span>
                  </button>
                )
              })}
              <span>メンバー</span>
              {(() => {
                const col: SortKey = 'progress'
                const active = tableSort.key === col
                return (
                  <button onClick={() => setTableSortPersisted(col)} style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                    color: active ? 'var(--text)' : 'var(--text-3)',
                    display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'inherit',
                  }}>
                    進捗
                    <span style={{ fontSize: 9, opacity: active ? 1 : 0.35 }}>{active ? (tableSort.dir === 'asc' ? '▲' : '▼') : '▲'}</span>
                  </button>
                )
              })()}
              <span/>
            </div>
            {sortedProjects.map((p, i) => {
              const accent = p.statusColor ?? 'var(--text-3)'
              const progress = p.taskCount > 0 ? Math.round((p.completedTaskCount / p.taskCount) * 100) : 0
              const selected = i === navIdx
              return (
                <div key={p.id} data-list-index={i} onClick={() => openPanel?.(p)} style={{
                  display: 'grid', gridTemplateColumns: '24px 1fr 120px 120px 120px 100px 32px',
                  gap: 16, padding: '12px 16px', borderBottom: i < sortedProjects.length - 1 ? '1px solid var(--divider)' : 'none',
                  alignItems: 'center', cursor: 'pointer',
                  background: selected ? 'var(--accent-soft)' : 'transparent',
                }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = selected ? 'var(--accent-soft)' : 'var(--card-2)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = selected ? 'var(--accent-soft)' : 'transparent'}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: accent }}/>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{p.title}</span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <StatusChip name={p.statusName ?? ''} color={p.statusColor ?? '#9CA3AF'}/>
                    {isSearching && p.archived && (
                      <span className="chip" style={{ background: 'var(--text-4)', color: 'var(--bg)', fontSize: 10 }}>アーカイブ</span>
                    )}
                  </div>
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{formatDates(p.startDate, p.endDate)}</span>
                  <AvatarStack names={p.memberNames} urls={p.memberAvatarUrls} size={22}/>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--divider)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progress}%`, background: accent, borderRadius: 3 }}/>
                  </div>
                  <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}><Icon name="more" size={14}/></button>
                </div>
              )
            })}
          </div>
        ) : (
          /* Grid (PC) / List with cover photos (mobile) */
          <div style={{
            display: isMobile ? 'flex' : 'grid',
            flexDirection: 'column',
            gridTemplateColumns: isMobile ? undefined : 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: isMobile ? 10 : 16,
          }}>
            {filteredProjects.map((p, i) => {
              const accent = p.statusColor ?? 'var(--text-3)'
              const progress = p.taskCount > 0 ? Math.round((p.completedTaskCount / p.taskCount) * 100) : 0

              if (isMobile) {
                return (
                  <div key={p.id} onClick={() => openPanel?.(p)} style={{
                    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
                    overflow: 'hidden', cursor: 'pointer',
                    display: 'flex', alignItems: 'stretch',
                  }}>
                    {/* Cover photo thumbnail */}
                    <div style={{ width: 88, flexShrink: 0, position: 'relative' }}>
                      {p.coverPhotoUrl
                        ? <img src={p.coverPhotoUrl} alt="" style={{ width: 88, height: 88, objectFit: 'cover', display: 'block' }}/>
                        : <MountainPhoto idx={p.coverPhotoIdx} height={88} flat radius={0}/>
                      }
                    </div>
                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0, padding: '12px 14px' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.title}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>
                        {formatDates(p.startDate, p.endDate)}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <StatusChip name={p.statusName ?? ''} color={p.statusColor ?? '#9CA3AF'}/>
                        {isSearching && p.archived && (
                          <span className="chip" style={{ background: 'var(--text-4)', color: 'var(--bg)', fontSize: 10 }}>アーカイブ</span>
                        )}
                        <AvatarStack names={p.memberNames} urls={p.memberAvatarUrls} size={20}/>
                        <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 2 }}>{p.memberCount}人</span>
                      </div>
                    </div>
                  </div>
                )
              }

              return (
                <div key={p.id} data-list-index={i} onClick={() => openPanel?.(p)} style={{
                  background: 'var(--card)', borderRadius: 12,
                  overflow: 'hidden', cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
                  transition: 'transform .15s, box-shadow .15s',
                  border: i === navIdx ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)' }}
                >
                  <div style={{ position: 'relative' }}>
                    {p.coverPhotoUrl
                      ? <img src={p.coverPhotoUrl} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }}/>
                      : <MountainPhoto idx={p.coverPhotoIdx} height={120} flat/>
                    }
                    <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <StatusChip name={p.statusName ?? ''} color={p.statusColor ?? '#9CA3AF'}/>
                      {isSearching && p.archived && (
                        <span className="chip" style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 10, backdropFilter: 'blur(4px)' }}>アーカイブ</span>
                      )}
                    </div>
                  </div>
                  <div style={{ padding: '12px 14px 14px' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{p.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>{formatDates(p.startDate, p.endDate)} · {p.memberCount}人</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <AvatarStack names={p.memberNames} urls={p.memberAvatarUrls} size={22}/>
                      {p.taskCount > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, color: 'var(--text-3)' }}>
                          <Icon name="check" size={12}/>{p.completedTaskCount}/{p.taskCount}
                        </span>
                      )}
                    </div>
                    {p.taskCount > 0 && (
                      <div style={{ marginTop: 10, height: 5, borderRadius: 3, background: 'var(--divider)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${progress}%`, background: accent, borderRadius: 3 }}/>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Mobile FAB */}
      {isMobile && canCreateProject && <Fab onClick={() => setShowCreate(true)} label={`新規${projectLabel}`}/>}
    </div>
  )
}
