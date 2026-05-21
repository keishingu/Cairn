'use client'

import { useAppShell } from '@/components/app/app-shell-context'
import { ProjectListView } from './projects-list-view'
import { PageCalendar } from './calendar'
import { PageKanban } from './kanban-page'
import type { ProjectDto } from '@/app/api/projects/route'

interface PageProjectsProps {
  openPanel: (project?: ProjectDto) => void
}

export function PageProjects({ openPanel }: PageProjectsProps) {
  const { projectsView } = useAppShell()
  if (projectsView === 'calendar') return <PageCalendar openPanel={openPanel} />
  if (projectsView === 'kanban') return <PageKanban openPanel={openPanel} />
  return <ProjectListView openPanel={openPanel} />
}
