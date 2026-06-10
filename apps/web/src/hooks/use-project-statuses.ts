import { useQuery } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'

export function useProjectStatuses() {
  return useQuery<ProjectStatusDto[]>({
    queryKey: ['statuses'],
    queryFn: () => fetchWithAuth('/api/projects/statuses').then(r => r.json()),
  })
}
