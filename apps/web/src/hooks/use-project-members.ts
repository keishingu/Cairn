import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { ProjectMemberDto } from '@/app/api/projects/[id]/members/route'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'

export interface WorkspaceInviteDto {
  id: string
  token: string
  url: string
  expiresAt: string | null
  maxUses: number | null
  useCount: number
  role: string
  createdAt: string
  createdByName: string
}

interface WorkspaceInvitesResponse {
  invites?: WorkspaceInviteDto[]
}

interface CreateWorkspaceInviteInput {
  expiresIn: '1h' | '30d' | 'never'
}

interface CreateWorkspaceInviteResponse {
  token: string
  url: string
  expiresAt: string | null
  role?: string
}

interface CreateGuestInviteResponse {
  token: string
  url: string
  expiresAt: string | null
}

export function useWorkspaceMembers(options?: { enabled?: boolean }) {
  return useQuery<WorkspaceMemberDto[]>({
    queryKey: ['workspace-members'],
    queryFn: async (): Promise<WorkspaceMemberDto[]> => fetchWithAuth('/api/workspaces/members').then(r => r.json()),
    ...(options?.enabled !== undefined ? { enabled: options.enabled } : {}),
  })
}

export function useProjectMembers(projectId: string | null) {
  return useQuery<ProjectMemberDto[]>({
    queryKey: ['project-members', projectId],
    queryFn: async (): Promise<ProjectMemberDto[]> => fetchWithAuth(`/api/projects/${projectId!}/members`).then(r => r.json()),
    enabled: !!projectId,
  })
}

export function useWorkspaceMembersForInvite(enabled: boolean) {
  return useQuery<WorkspaceMemberDto[]>({
    queryKey: ['workspace-members', 'active'],
    queryFn: () => fetchWithAuth('/api/workspaces/members?status=active').then(r => r.json()),
    enabled,
  })
}

export function useWorkspaceInvites(enabled = true) {
  return useQuery<WorkspaceInviteDto[]>({
    queryKey: ['workspace-invites'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/workspaces/invites')
      const data = await res.json() as WorkspaceInvitesResponse
      return data.invites ?? []
    },
    enabled,
  })
}

export function useCreateWorkspaceInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ expiresIn }: CreateWorkspaceInviteInput) => {
      const res = await fetchWithAuth('/api/workspaces/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn }),
      })
      const data = await res.json().catch(() => ({})) as Partial<CreateWorkspaceInviteResponse> & { error?: string }
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? '招待リンクの生成に失敗しました')
      }
      return data as CreateWorkspaceInviteResponse
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-invites'] })
    },
  })
}

export function useRevokeWorkspaceInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (token: string) => {
      const res = await fetchWithAuth(`/api/workspaces/invites/${token}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? '招待リンクの無効化に失敗しました')
      }
      return token
    },
    onSuccess: (token) => {
      queryClient.setQueryData<WorkspaceInviteDto[]>(
        ['workspace-invites'],
        old => old?.filter(invite => invite.token !== token),
      )
    },
  })
}

export function useCreateProjectGuestInvite(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/projects/${projectId}/guest-invite`, { method: 'POST' })
      const data = await res.json().catch(() => ({})) as Partial<CreateGuestInviteResponse> & { error?: string }
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? '招待リンクの生成に失敗しました')
      }
      return data as CreateGuestInviteResponse
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-invites'] })
    },
  })
}

export function useAddProjectMember(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userIds, role }: { userIds: string[]; role: string }) => {
      const res = await fetchWithAuth(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds, role }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Failed')
      }
      const data = await res.json() as ProjectMemberDto | ProjectMemberDto[]
      return Array.isArray(data) ? data : [data]
    },
    onSuccess: (newMembers) => {
      queryClient.setQueryData<ProjectMemberDto[]>(
        ['project-members', projectId],
        old => [...(old ?? []), ...newMembers],
      )
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useRemoveProjectMember(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetchWithAuth(`/api/projects/${projectId}/members/${userId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('削除に失敗しました')
    },
    onSuccess: (_data, userId) => {
      queryClient.setQueryData<ProjectMemberDto[]>(
        ['project-members', projectId],
        old => old?.filter(m => m.userId !== userId) ?? [],
      )
    },
  })
}
