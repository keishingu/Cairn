import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api-fetch'
import { fetchApiJson } from '../lib/fetch-api-json'
import { pinnedProjectsQueryKey } from '../lib/channel-list-queries'
import { useT } from '../components/locale-provider'

interface PinnedProjectDto {
  projectId: string
}

export function usePinnedProjectIds() {
  const t = useT()
  return useQuery({
    queryKey: pinnedProjectsQueryKey,
    queryFn: () => fetchApiJson<PinnedProjectDto[]>('/api/projects/pinned', t('Could not load pinned projects ({status})')),
    select: (rows): ReadonlySet<string> => new Set(rows.map((row) => row.projectId)),
    staleTime: 30_000,
  })
}

export function useTogglePinProject() {
  const t = useT()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, pinned }: { projectId: string; pinned: boolean }) => {
      const res = await apiFetch('/api/projects/pinned', {
        method: pinned ? 'POST' : 'DELETE',
        body: JSON.stringify({ projectId }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? t('Could not update the pin'))
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pinnedProjectsQueryKey })
    },
  })
}
