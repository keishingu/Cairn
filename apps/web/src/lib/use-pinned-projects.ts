import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWithAuth } from './fetch-with-auth'
import type { PinnedProjectDto } from '@/app/api/projects/pinned/route'

export function usePinnedProjects() {
  return useQuery<PinnedProjectDto[]>({
    queryKey: ['pinned-projects'],
    queryFn: () => fetchWithAuth('/api/projects/pinned').then(r => r.json()),
    staleTime: 30_000,
  })
}

export function usePinProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) =>
      fetchWithAuth('/api/projects/pinned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pinned-projects'] }) },
  })
}

export function useUnpinProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) =>
      fetchWithAuth('/api/projects/pinned', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pinned-projects'] }) },
  })
}
