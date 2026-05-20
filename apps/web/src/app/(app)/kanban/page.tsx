// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useQuery } from '@tanstack/react-query'
import { useAppShell } from '@/components/app/app-shell-context'
import { TopBar } from '@/components/app/sidebar'
import { TopBarSearch } from '@/components/app/primitives'
import { PageKanban } from '@/components/app/pages/kanban-page'
import type { ProjectDto } from '@/app/api/projects/route'
import type { StatusKey } from '@/components/app/data'

const ACTIVE_STATUSES: StatusKey[] = ['plan', 'review', 'wait', 'doing', 'retro']

export default function KanbanPage() {
  const { openPanel, openNotif } = useAppShell()

  const { data: projects } = useQuery<ProjectDto[]>({
    queryKey: ['projects'],
    queryFn: () => fetch('/api/projects').then(r => r.json()),
  })

  const count = projects?.length ?? 0
  const stageCount = projects
    ? new Set(projects.map(p => p.statusName).filter(s => ACTIVE_STATUSES.includes(s))).size
    : 0
  const subtitle = projects ? `${count} 件 / ${stageCount || ACTIVE_STATUSES.length} ステージ` : null

  return (
    <>
      <TopBar title="カンバン" subtitle={subtitle} onBell={openNotif}>
        <TopBarSearch />
      </TopBar>
      <PageKanban openPanel={openPanel} />
    </>
  )
}
