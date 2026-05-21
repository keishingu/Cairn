'use client'

import React from 'react'
import { useSearchParams } from 'next/navigation'
import { ProjectListView } from './projects-list-view'
import { PageCalendar } from './calendar'
import { PageKanban } from './kanban-page'
import type { ProjectDto } from '@/app/api/projects/route'

type ViewId = 'list' | 'calendar' | 'kanban'

const PC_STORAGE_KEY = 'cairn:projects_view_pc'

function isValidView(v: string | null | undefined): v is ViewId {
  return v === 'list' || v === 'calendar' || v === 'kanban'
}

interface PageProjectsProps {
  openPanel: (project?: ProjectDto) => void
}

function PageProjectsInner({ openPanel }: PageProjectsProps) {
  const searchParams = useSearchParams()
  const viewParam = searchParams.get('view')

  const [view, setView] = React.useState<ViewId>(() => {
    if (isValidView(viewParam)) return viewParam
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(PC_STORAGE_KEY)
      if (isValidView(saved)) return saved
    }
    return 'list'
  })

  React.useEffect(() => {
    if (isValidView(viewParam) && viewParam !== view) {
      setView(viewParam)
    }
  }, [viewParam]) // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    localStorage.setItem(PC_STORAGE_KEY, view)
  }, [view])

  if (view === 'calendar') return <PageCalendar openPanel={openPanel} />
  if (view === 'kanban') return <PageKanban openPanel={openPanel} />
  return <ProjectListView openPanel={openPanel} />
}

export function PageProjects({ openPanel }: PageProjectsProps) {
  return (
    <React.Suspense fallback={<ProjectListView openPanel={openPanel} />}>
      <PageProjectsInner openPanel={openPanel} />
    </React.Suspense>
  )
}
