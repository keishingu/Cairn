import { useQuery } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'
import { projectQueryKeys } from './use-projects'

export function useProjectStatuses() {
  return useQuery<ProjectStatusDto[]>({
    queryKey: projectQueryKeys.statuses,
    queryFn: async () => {
      const res = await fetchWithAuth('/api/projects/statuses')
      if (!res.ok) throw new Error('fetch failed')
      return res.json() as Promise<ProjectStatusDto[]>
    },
  })
}
