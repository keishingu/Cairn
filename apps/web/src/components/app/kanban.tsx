'use client'

import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon, AvatarStack } from './primitives'
import type { ProjectDto } from '@/app/api/projects/route'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return ''
  const fmt = (s: string) => {
    const d = new Date(s + 'T00:00:00')
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  if (!end || end === start) return fmt(start)
  return `${fmt(start)}–${fmt(end)}`
}

interface KanbanCardProps {
  project: ProjectDto
  barColor: string
  onClick: () => void
  onDragStart: () => void
  onDragEnd: () => void
  dragging: boolean
}

const KanbanCard = ({ project, barColor, onClick, onDragStart, onDragEnd, dragging }: KanbanCardProps) => {
  const dateStr = formatDateRange(project.startDate, project.endDate)
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '10px 12px',
        borderLeft: `3px solid ${barColor}`,
        cursor: 'grab',
        transition: 'box-shadow .12s, transform .12s, opacity .12s',
        boxShadow: 'var(--shadow-sm)',
        opacity: dragging ? 0.4 : 1,
      }}
      onMouseEnter={e => {
        if (!dragging) {
          (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)'
          ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
        }
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)'
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, marginBottom: 4 }}>
        {project.title}
      </div>
      {dateStr && (
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>{dateStr}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <AvatarStack names={project.memberNames} size={20} max={4} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-3)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Icon name="users" size={11.5} />
            {project.memberCount}
          </span>
        </div>
      </div>
    </div>
  )
}

const KanbanCardSkeleton = () => (
  <div style={{
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '10px 12px', borderLeft: '3px solid var(--border)',
  }}>
    <div style={{ height: 13, width: '70%', borderRadius: 4, background: 'var(--card-2)', marginBottom: 8 }} />
    <div style={{ height: 11, width: '40%', borderRadius: 4, background: 'var(--card-2)', marginBottom: 10 }} />
    <div style={{ height: 20, width: '50%', borderRadius: 10, background: 'var(--card-2)' }} />
  </div>
)

interface KanbanColumnProps {
  status: ProjectStatusDto
  items: ProjectDto[]
  onCardClick: (project: ProjectDto) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  draggingId: string | null
  onDrop: (statusId: string) => void
  dropTarget: string | null
  onDragOver: (statusId: string | null) => void
  isLoading?: boolean
}

const KanbanColumn = ({
  status, items, onCardClick, onDragStart, onDragEnd,
  draggingId, onDrop, dropTarget, onDragOver, isLoading,
}: KanbanColumnProps) => {
  const bg   = status.color + '18'
  const bar  = status.color
  const text = status.color
  const isTarget = dropTarget === status.id
  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver(status.id) }}
      onDragLeave={() => onDragOver(null)}
      onDrop={e => { e.preventDefault(); onDrop(status.id) }}
      style={{
        background: bg, borderRadius: 10,
        display: 'flex', flexDirection: 'column',
        minWidth: 0, minHeight: 0,
        outline: isTarget ? `2px dashed ${bar}` : '2px dashed transparent',
        outlineOffset: -2,
        transition: 'outline-color .12s',
      }}
    >
      <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: text, letterSpacing: '0.01em' }}>
          {status.name}
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: text, opacity: 0.7 }}>
          {isLoading ? '…' : items.length}
        </span>
      </div>
      <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflow: 'auto' }}>
        {isLoading
          ? Array.from({ length: 2 }).map((_, i) => <KanbanCardSkeleton key={i} />)
          : items.map(p => (
            <KanbanCard
              key={p.id}
              project={p}
              barColor={bar}
              onClick={() => onCardClick(p)}
              onDragStart={() => onDragStart(p.id)}
              onDragEnd={onDragEnd}
              dragging={draggingId === p.id}
            />
          ))
        }
        <button style={{
          border: 'none', background: 'transparent',
          padding: '8px 6px', fontSize: 12, fontWeight: 500,
          color: text, opacity: 0.8, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'inherit', textAlign: 'left',
        }}>
          <Icon name="plus" size={13} /> カードを追加
        </button>
      </div>
    </div>
  )
}

interface KanbanBoardProps {
  onCardClick: (project: ProjectDto) => void
  isMobile?: boolean
  statusFilter?: string[]
  projectFilter?: (p: ProjectDto) => boolean
}

export const KanbanBoard = ({ onCardClick, isMobile = false, statusFilter, projectFilter }: KanbanBoardProps) => {
  const queryClient = useQueryClient()

  const { data: statuses = [], isLoading: statusesLoading } = useQuery<ProjectStatusDto[]>({
    queryKey: ['statuses'],
    queryFn: () => fetchWithAuth('/api/projects/statuses').then(r => r.json()),
  })

  const { data: allProjects = [], isLoading: projectsLoading } = useQuery<ProjectDto[]>({
    queryKey: ['projects'],
    queryFn: () => fetchWithAuth('/api/projects').then(r => r.json()),
  })

  const projects = projectFilter ? allProjects.filter(projectFilter) : allProjects
  const visibleStatuses = statusFilter?.length ? statuses.filter(s => statusFilter.includes(s.name)) : statuses

  const isLoading = statusesLoading || projectsLoading

  const updateStatus = useMutation({
    mutationFn: async ({ id, statusName }: { id: string; statusName: string }) => {
      const res = await fetchWithAuth(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusName }),
      })
      if (!res.ok) throw new Error('Failed to update status')
    },
    onMutate: async ({ id, statusName }) => {
      await queryClient.cancelQueries({ queryKey: ['projects'] })
      const prev = queryClient.getQueryData<ProjectDto[]>(['projects'])
      const targetStatus = statuses.find(s => s.name === statusName)
      queryClient.setQueryData<ProjectDto[]>(
        ['projects'],
        old => old?.map(p => p.id === id ? { ...p, statusName, statusColor: targetStatus?.color ?? p.statusColor } : p) ?? [],
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['projects'], ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const [dropTarget, setDropTarget] = React.useState<string | null>(null)

  const onDragStart = (id: string) => setDraggingId(id)
  const onDragEnd = () => { setDraggingId(null); setDropTarget(null) }
  const onDragOver = (statusId: string | null) => setDropTarget(statusId)
  const onDrop = (statusId: string) => {
    if (!draggingId) return
    const targetStatus = statuses.find(s => s.id === statusId)
    if (!targetStatus) return
    const project = projects.find(p => p.id === draggingId)
    if (project && project.statusName !== targetStatus.name) {
      updateStatus.mutate({ id: draggingId, statusName: targetStatus.name })
    }
    setDraggingId(null)
    setDropTarget(null)
  }

  if (isMobile) {
    return (
      <div style={{
        display: 'flex', gap: 10, overflowX: 'auto', overflowY: 'hidden',
        padding: '12px 16px', height: '100%',
        scrollSnapType: 'x mandatory',
      }}>
        {visibleStatuses.map(s => (
          <div key={s.id} style={{ flexShrink: 0, width: 'calc(85vw)', maxWidth: 320, scrollSnapAlign: 'start', display: 'flex', flexDirection: 'column' }}>
            <KanbanColumn
              status={s}
              items={projects.filter(p => p.statusName === s.name)}
              onCardClick={onCardClick}
              onDragStart={() => {}}
              onDragEnd={() => {}}
              onDragOver={() => {}}
              onDrop={() => {}}
              draggingId={null}
              dropTarget={null}
              isLoading={isLoading}
            />
          </div>
        ))}
        <div style={{ flexShrink: 0, width: 6 }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleStatuses.length || 5}, 1fr)`, gap: 10, height: '100%' }}>
      {visibleStatuses.map(s => (
        <KanbanColumn
          key={s.id}
          status={s}
          items={projects.filter(p => p.statusName === s.name)}
          onCardClick={onCardClick}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          onDrop={onDrop}
          draggingId={draggingId}
          dropTarget={dropTarget}
          isLoading={isLoading}
        />
      ))}
    </div>
  )
}
