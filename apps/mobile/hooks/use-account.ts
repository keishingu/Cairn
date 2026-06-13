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

export interface WorkspaceMemberDto {
  userId: string
  displayName: string
  avatarUrl: string | null
  role: 'owner' | 'admin' | 'member' | 'guest'
  joinedAt: string
  projectCount: number
}

export function useMe() {
  return useQuery<MeDto>({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await apiFetch('/api/me')
      if (!res.ok) throw new Error(`ユーザー情報の取得に失敗しました (${res.status})`)
      return res.json() as Promise<MeDto>
    },
    staleTime: 60_000,
  })
}

export function useWorkspace() {
  return useQuery<WorkspaceDto>({
    queryKey: ['workspace'],
    queryFn: async () => {
      const res = await apiFetch('/api/workspaces')
      if (!res.ok) throw new Error(`ワークスペース情報の取得に失敗しました (${res.status})`)
      return res.json() as Promise<WorkspaceDto>
    },
    staleTime: 60_000,
  })
}

export function useWorkspaceMembers() {
  return useQuery<WorkspaceMemberDto[]>({
    queryKey: ['workspace-members'],
    queryFn: async () => {
      const res = await apiFetch('/api/workspaces/members')
      if (!res.ok) throw new Error(`メンバーの取得に失敗しました (${res.status})`)
      return res.json() as Promise<WorkspaceMemberDto[]>
    },
    staleTime: 60_000,
  })
}
