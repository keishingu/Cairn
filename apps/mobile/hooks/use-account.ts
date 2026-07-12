import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api-fetch'

export interface MeDto {
  displayName: string
  email: string | null
  avatarUrl: string | null
}

export interface WorkspaceDto {
  name: string
  logoUrl: string | null
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
