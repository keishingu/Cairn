import { useQuery } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'
import { projectQueryKeys } from './use-projects'

export function useProjectStatuses() {
  return useQuery<ProjectStatusDto[]>({
    queryKey: projectQueryKeys.statuses,
    queryFn: () => fetchWithAuth('/api/projects/statuses').then(r => r.json()),
  })
}
