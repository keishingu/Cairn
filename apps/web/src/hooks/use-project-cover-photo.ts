import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { ProjectDto } from '@/app/api/projects/route'
import type { PlacePhoto } from '@/app/api/places/photos/route'
import { projectQueryKeys } from './use-projects'

export function usePlacePhotos(placeId: string | null) {
  return useQuery<PlacePhoto[]>({
    queryKey: ['place-photos', placeId],
    queryFn: () => fetchWithAuth(`/api/places/photos?placeId=${encodeURIComponent(placeId!)}`).then(r => r.json()),
    enabled: !!placeId,
  })
}

function updateProjectCover(
  projects: ProjectDto[] | undefined,
  projectId: string,
  coverPhotoUrl: string | null,
) {
  return (projects ?? []).map(project => (
    project.id === projectId ? { ...project, coverPhotoUrl } : project
  ))
}

export function useClearProjectCoverPhoto(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverPhotoUrl: null }),
      })
      if (!res.ok) throw new Error('Failed to update cover photo')
      return null
    },
    onSuccess: () => {
      queryClient.setQueryData<ProjectDto[]>(
        projectQueryKeys.all,
        old => updateProjectCover(old, projectId, null),
      )
    },
  })
}

export function useApplyPlacePhoto(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (photoName: string) => {
      const res = await fetchWithAuth(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placePhotoName: photoName }),
      })
      if (!res.ok) throw new Error('Failed to update cover photo')
      return res.json() as Promise<{ coverPhotoUrl?: string | null }>
    },
    onSuccess: (data) => {
      if (data.coverPhotoUrl === undefined) return
      queryClient.setQueryData<ProjectDto[]>(
        projectQueryKeys.all,
        old => updateProjectCover(old, projectId, data.coverPhotoUrl ?? null),
      )
    },
  })
}
