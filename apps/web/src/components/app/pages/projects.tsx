'use client'

import { useAppShell } from '@/components/app/app-shell-context'
import { ProjectListView } from './project-list'
import { PageCalendar } from './projects-calendar'
import { PageKanban } from './projects-kanban'
import type { ProjectDto } from '@/app/api/projects/route'

interface PageProjectsProps {
  openPanel: (project?: ProjectDto) => void
  search?: string
}

export function PageProjects({ openPanel, search }: PageProjectsProps) {
  const { projectsView } = useAppShell()
  if (projectsView === 'calendar') return <PageCalendar openPanel={openPanel} />
  if (projectsView === 'kanban') return <PageKanban openPanel={openPanel} />
  return <ProjectListView openPanel={openPanel} {...(search !== undefined ? { externalSearch: search } : {})} />
}
