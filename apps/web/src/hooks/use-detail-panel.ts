// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import type { ProjectDto } from '@/app/api/projects/route'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

async function fetchProjects(): Promise<ProjectDto[]> {
  const res = await fetchWithAuth('/api/projects')
  if (!res.ok) throw new Error('fetch failed')
  return res.json() as Promise<ProjectDto[]>
}

async function fetchMembers(): Promise<WorkspaceMemberDto[]> {
  const res = await fetchWithAuth('/api/workspaces/members')
  if (!res.ok) throw new Error('fetch failed')
  return res.json() as Promise<WorkspaceMemberDto[]>
}

export type PanelState =
  | { type: 'project'; id: string }
  | { type: 'member'; id: string }
  | null

export interface UseDetailPanelResult {
  panelState: PanelState
  panelProject: ProjectDto | null
  panelMember: WorkspaceMemberDto | null
  /** プロジェクトパネルを開く。引数なしで閉じる（AppShellContext 後方互換） */
  openPanel: (project?: ProjectDto) => void
  /** MemberProjectDto から遷移するとき用（ID のみ渡す） */
  openProjectById: (id: string) => void
  openMember: (userId: string) => void
  /** PCシェル: パネルを閉じて ?open なし URL へ push */
  closePanel: () => void
  /** モバイルシェル: ブラウザ履歴を 1 つ戻る */
  backPanel: () => void
}

export function useDetailPanel(): UseDetailPanelResult {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  const openParam = searchParams.get('open') ?? ''

  const panelState = useMemo<PanelState>(() => {
    if (openParam.startsWith('project-')) {
      return { type: 'project', id: openParam.slice('project-'.length) }
    }
    if (openParam.startsWith('member-')) {
      return { type: 'member', id: openParam.slice('member-'.length) }
    }
    return null
  }, [openParam])

  const { data: projects = [] } = useQuery<ProjectDto[]>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    enabled: panelState?.type === 'project',
  })

  const { data: members = [] } = useQuery<WorkspaceMemberDto[]>({
    queryKey: ['workspace-members'],
    queryFn: fetchMembers,
    enabled: panelState?.type === 'member',
  })

  const panelProject: ProjectDto | null =
    panelState?.type === 'project'
      ? (projects.find(p => p.id === panelState.id) ?? null)
      : null

  const panelMember: WorkspaceMemberDto | null =
    panelState?.type === 'member'
      ? (members.find(m => m.userId === panelState.id) ?? null)
      : null

  const buildUrl = useCallback(
    (openValue: string | null): string => {
      const params = new URLSearchParams(searchParams.toString())
      if (openValue) {
        params.set('open', openValue)
      } else {
        params.delete('open')
      }
      const qs = params.toString()
      return qs ? `${pathname}?${qs}` : pathname
    },
    [pathname, searchParams],
  )

  const openPanel = useCallback(
    (project?: ProjectDto) => {
      router.push(buildUrl(project ? `project-${project.id}` : null), { scroll: false })
    },
    [router, buildUrl],
  )

  const openProjectById = useCallback(
    (id: string) => {
      router.push(buildUrl(`project-${id}`), { scroll: false })
    },
    [router, buildUrl],
  )

  const openMember = useCallback(
    (userId: string) => {
      router.push(buildUrl(`member-${userId}`), { scroll: false })
    },
    [router, buildUrl],
  )

  const closePanel = useCallback(
    () => router.push(buildUrl(null), { scroll: false }),
    [router, buildUrl],
  )

  const backPanel = useCallback(
    () => router.back(),
    [router],
  )

  return { panelState, panelProject, panelMember, openPanel, openProjectById, openMember, closePanel, backPanel }
}
