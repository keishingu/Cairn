import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

type ProjectStatusInput = {
  name: string
  color: string
}

export function useCreateProjectStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ name, color }: ProjectStatusInput) => {
      const res = await fetchWithAuth('/api/projects/statuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      })
      if (!res.ok) throw new Error('追加に失敗しました')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['statuses'] })
    },
  })
}

export function useUpdateProjectStatus(statusId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ name, color }: ProjectStatusInput) => {
      const res = await fetchWithAuth(`/api/projects/statuses/${statusId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      })
      if (!res.ok) throw new Error('更新に失敗しました')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['statuses'] })
    },
  })
}

export function useDeleteProjectStatus(statusId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/projects/statuses/${statusId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('削除に失敗しました')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['statuses'] })
    },
  })
}
