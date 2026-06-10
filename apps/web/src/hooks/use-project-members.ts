import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { ProjectMemberDto } from '@/app/api/projects/[id]/members/route'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'

export function useProjectMembers(projectId: string) {
  return useQuery<ProjectMemberDto[]>({
    queryKey: ['project-members', projectId],
    queryFn: () => fetchWithAuth(`/api/projects/${projectId}/members`).then(r => r.json()),
  })
}

export function useWorkspaceMembersForInvite(enabled: boolean) {
  return useQuery<WorkspaceMemberDto[]>({
    queryKey: ['workspace-members'],
    queryFn: () => fetchWithAuth('/api/workspaces/members').then(r => r.json()),
    enabled,
  })
}

export function useAddProjectMember(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await fetchWithAuth(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Failed')
      }
      return res.json() as Promise<ProjectMemberDto>
    },
    onSuccess: (newMember) => {
      queryClient.setQueryData<ProjectMemberDto[]>(
        ['project-members', projectId],
        old => [...(old ?? []), newMember],
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
      if (!res.ok) throw new Error('Failed')
    },
    onSuccess: (_data, userId) => {
      queryClient.setQueryData<ProjectMemberDto[]>(
        ['project-members', projectId],
        old => old?.filter(m => m.userId !== userId) ?? [],
      )
    },
  })
}
