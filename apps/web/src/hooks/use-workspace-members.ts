import { useQuery } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'

export function useWorkspaceMembers(enabled = true) {
  return useQuery<WorkspaceMemberDto[]>({
    queryKey: ['workspace-members'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/workspaces/members')
      return res.json()
    },
    enabled,
  })
}
