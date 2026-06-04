'use client'

import React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Icon } from '../primitives'
import { KanbanBoard } from '../kanban'
import { MobileHeader } from '@/components/app/mobile/header'
import { PageToolbar } from './page-toolbar'
import { CreateProjectModal } from './project-list'
import { useProjectLabel } from '@/lib/use-workspace-settings'
import type { ProjectDto } from '@/app/api/projects/route'

interface PageKanbanProps {
  openPanel: (project?: ProjectDto) => void
  isMobile?: boolean
}

export const PageKanban = ({ openPanel, isMobile = false }: PageKanbanProps) => {
  const queryClient = useQueryClient()
  const projectLabel = useProjectLabel()
  const [showCreate, setShowCreate] = React.useState(false)

  const handleCreated = (project: ProjectDto) => {
    queryClient.setQueryData<ProjectDto[]>(['projects'], prev => [...(prev ?? []), project])
    setShowCreate(false)
  }

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
        right={
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Icon name="plus" size={13} /> 新規{projectLabel}
          </button>
        }
      />
      <div style={{ flex: 1, minHeight: 0 }}>
        <KanbanBoard onCardClick={openPanel} />
      </div>
    </div>
  )
}
