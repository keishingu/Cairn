import { useQuery } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

interface ProjectGuestInviteResponse {
  url?: string
  token?: string
  expiresAt?: string | null
  error?: string
}

export function useProjectGuestInvite(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['project-guest-invite', projectId],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/projects/${projectId}/guest-invite`, { method: 'POST' })
      const data = await res.json() as ProjectGuestInviteResponse
      if (!res.ok || !data.url || !data.token) {
        throw new Error(data.error ?? '招待リンクの生成に失敗しました')
      }
      return data
    },
    enabled,
    retry: false,
  })
}
