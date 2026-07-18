import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { useCurrentUser } from './use-current-user'
import type { CurrentUserDto } from '@/app/api/me/route'
import type { ProjectDto } from '@/app/api/projects/route'
import type { WorkspaceListItemDto } from '@/app/api/workspaces/list/route'
import type { WorkspaceDto } from '@/app/api/workspaces/route'
import type { UserStatus } from '@/lib/user-status'

export function useSidebarWorkspace() {
  return useQuery<WorkspaceDto>({
    queryKey: ['workspace'],
    queryFn: () => fetchWithAuth('/api/workspaces').then(r => r.json()),
    staleTime: 60_000,
  })
}

export function useSidebarWorkspaceList() {
  return useQuery<WorkspaceListItemDto[]>({
    queryKey: ['workspace-list'],
    queryFn: () => fetchWithAuth('/api/workspaces/list').then(r => r.json()),
    staleTime: 60_000,
  })
}

export function useSidebarProjects() {
  return useQuery<ProjectDto[]>({
    queryKey: ['projects'],
    queryFn: () => fetchWithAuth('/api/projects').then(r => r.json()),
    staleTime: 30_000,
  })
}

export function useSidebarCurrentUser() {
  const queryClient = useQueryClient()
  const currentUserQuery = useCurrentUser()

  const statusMutation = useMutation({
    mutationFn: async (status: UserStatus) => {
      const res = await fetchWithAuth('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'ステータスの更新に失敗しました')
      }
      return status
    },
    onSuccess: (status) => {
      queryClient.setQueryData<CurrentUserDto>(['me'], prev => prev ? { ...prev, status } : prev)
    },
  })

  const statusMessageMutation = useMutation({
    mutationFn: async (statusMessage: string | null) => {
      const res = await fetchWithAuth('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusMessage }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'ステータスメッセージの更新に失敗しました')
      }
      return statusMessage
    },
    onSuccess: (statusMessage) => {
      queryClient.setQueryData<CurrentUserDto>(['me'], prev => prev ? { ...prev, statusMessage } : prev)
    },
  })

  return {
    ...currentUserQuery,
    statusMutation,
    statusMessageMutation,
  }
}
