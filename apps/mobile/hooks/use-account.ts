import { useQuery } from '@tanstack/react-query'
import type { AccentId, AppearanceTheme } from '@cairn/shared'
import { fetchApiJson } from '../lib/fetch-api-json'
import {
  fetchWorkspaceMemberships,
  workspaceListQueryKey,
  type WorkspaceMembership,
} from '../lib/workspace-queries'

export interface MeDto {
  id: string
  displayName: string
  email: string | null
  avatarUrl: string | null
  theme: AppearanceTheme
  accentId: AccentId
  wsRole: 'owner' | 'admin' | 'member' | 'guest'
}

export interface WorkspaceDto {
  id: string
  name: string
  logoUrl: string | null
}

export type WorkspaceListItemDto = WorkspaceMembership

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => fetchApiJson<MeDto>('/api/me', 'ユーザー情報'),
    staleTime: 60_000,
  })
}

export function useWorkspace() {
  return useQuery({
    queryKey: ['workspace'],
    queryFn: () => fetchApiJson<WorkspaceDto>('/api/workspaces', 'ワークスペース情報'),
    staleTime: 60_000,
  })
}

export function useWorkspaceList(enabled = true) {
  return useQuery({
    queryKey: workspaceListQueryKey,
    queryFn: fetchWorkspaceMemberships,
    staleTime: 60_000,
    enabled,
  })
}
