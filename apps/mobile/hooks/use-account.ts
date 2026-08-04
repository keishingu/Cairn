import { useQuery } from '@tanstack/react-query'
import type { AccentId, AppearanceTheme } from '@cairn/shared'
import { apiFetch } from '../lib/api-fetch'

export interface MeDto {
  id: string
  displayName: string
  email: string | null
  avatarUrl: string | null
  theme: AppearanceTheme
  accentId: AccentId
}

export interface WorkspaceDto {
  id: string
  name: string
  logoUrl: string | null
}

export interface WorkspaceListItemDto {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  role: 'owner' | 'admin' | 'member' | 'guest'
}

async function getJson<T>(path: string, label: string): Promise<T> {
  const res = await apiFetch(path)
  if (!res.ok) throw new Error(`${label}の取得に失敗しました (${res.status})`)
  return res.json() as Promise<T>
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => getJson<MeDto>('/api/me', 'ユーザー情報'),
    staleTime: 60_000,
  })
}

export function useWorkspace() {
  return useQuery({
    queryKey: ['workspace'],
    queryFn: () => getJson<WorkspaceDto>('/api/workspaces', 'ワークスペース情報'),
    staleTime: 60_000,
  })
}

export function useWorkspaceList(enabled = true) {
  return useQuery({
    queryKey: ['workspace-list'],
    queryFn: () => getJson<WorkspaceListItemDto[]>('/api/workspaces/list', 'ワークスペース一覧'),
    staleTime: 60_000,
    enabled,
  })
}
