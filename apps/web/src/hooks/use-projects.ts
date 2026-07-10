import { useQuery } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { ProjectDto } from '@/app/api/projects/route'

export const projectQueryKeys = {
  all: ['projects'] as const,
  statuses: ['statuses'] as const,
}

export function useProjects() {
  return useQuery<ProjectDto[]>({
    queryKey: projectQueryKeys.all,
    queryFn: async () => {
      const res = await fetchWithAuth('/api/projects')
      if (!res.ok) throw new Error('fetch failed')
      return res.json() as Promise<ProjectDto[]>
    },
  })
}
