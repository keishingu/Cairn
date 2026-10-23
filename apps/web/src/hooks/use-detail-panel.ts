// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import type { ProjectDto } from '@/app/api/projects/route'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { STORAGE_KEYS } from '@/lib/storage-keys'

const DEFAULT_PANEL_TAB = 'chat'
const PANEL_TABS = new Set(['overview', 'chat', 'files', 'tasks', 'members', 'gallery'])

function isPanelTab(value: string | null): value is string {
  return value !== null && PANEL_TABS.has(value)
}

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
  /** プロジェクトパネルのアクティブタブ（?tab= を優先し、前回値を localStorage から復元） */
  panelTab: string
  /** タブ切替: localStorage に保存し、履歴を汚さないよう router.replace で ?tab を更新する */
  setPanelTab: (tab: string) => void
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

  const tabParam = searchParams.get('tab')
  const [storedPanelTab, setStoredPanelTab] = useState(DEFAULT_PANEL_TAB)

  useEffect(() => {
    if (isPanelTab(tabParam)) {
      localStorage.setItem(STORAGE_KEYS.project_detail_tab, tabParam)
      setStoredPanelTab(tabParam)
      return
    }

    const storedTab = localStorage.getItem(STORAGE_KEYS.project_detail_tab)
    if (isPanelTab(storedTab)) setStoredPanelTab(storedTab)
  }, [tabParam])

  const panelTab = isPanelTab(tabParam) ? tabParam : storedPanelTab

  const buildUrl = useCallback(
    (openValue: string | null): string => {
      const params = new URLSearchParams(searchParams.toString())
      if (openValue) {
        params.set('open', openValue)
        if (!isPanelTab(params.get('tab'))) {
          if (panelTab === DEFAULT_PANEL_TAB) params.delete('tab')
          else params.set('tab', panelTab)
        }
      } else {
        params.delete('open')
      }
      // tab はプロジェクトに依存しない UI 状態として維持する。
      // プロジェクト切替・パネル再表示・リロード後も最後に選んだタブを開ける。
      const qs = params.toString()
      return qs ? `${pathname}?${qs}` : pathname
    },
    [panelTab, pathname, searchParams],
  )

  const setPanelTab = useCallback(
    (tabValue: string) => {
      if (!isPanelTab(tabValue)) return
      localStorage.setItem(STORAGE_KEYS.project_detail_tab, tabValue)
      setStoredPanelTab(tabValue)
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', tabValue)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams],
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

  return { panelState, panelProject, panelMember, panelTab, setPanelTab, openPanel, openProjectById, openMember, closePanel, backPanel }
}
