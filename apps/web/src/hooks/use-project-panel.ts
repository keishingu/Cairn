// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import type { ProjectDto } from '@/app/api/projects/route'

async function fetchProjects(): Promise<ProjectDto[]> {
  const res = await fetch('/api/projects')
  if (!res.ok) throw new Error('fetch failed')
  return res.json() as Promise<ProjectDto[]>
}

export interface UseProjectPanelResult {
  panelProject: ProjectDto | null
  openPanel: (project?: ProjectDto) => void
}

// PCShell / MobileShell 共通: パスから開くプロジェクトを導出し、openPanel を提供する
export function useProjectPanel(): UseProjectPanelResult {
  const pathname = usePathname()
  const router = useRouter()

  const openProjectId = pathname.match(/^\/projects\/([^/?#]+)/)?.[1] ?? null

  const { data: projects = [] } = useQuery<ProjectDto[]>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    enabled: !!openProjectId,
  })

  const panelProject: ProjectDto | null = openProjectId
    ? (projects.find(p => p.id === openProjectId) ?? null)
    : null

  const openPanel = useCallback(
    (project?: ProjectDto) => {
      if (project) {
        router.push(`/projects/${project.id}`, { scroll: false })
      } else {
        router.push('/projects', { scroll: false })
      }
    },
    [router],
  )

  return { panelProject, openPanel }
}
