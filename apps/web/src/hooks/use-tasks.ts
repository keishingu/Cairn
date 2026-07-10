import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TaskDto } from '@/app/api/tasks/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

export function useTasks() {
  return useQuery<TaskDto[]>({
    queryKey: ['tasks'],
    queryFn: () => fetchWithAuth('/api/tasks').then(r => r.json()),
  })
}

export function useToggleTaskStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: TaskDto['status'] }) => {
      const res = await fetchWithAuth(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error('Failed to update task')
    },
    onMutate: async ({ id, newStatus }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const prev = queryClient.getQueryData<TaskDto[]>(['tasks'])
      queryClient.setQueryData<TaskDto[]>(
        ['tasks'],
        old => old?.map(task => task.id === id ? { ...task, status: newStatus } : task) ?? [],
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['tasks'], ctx.prev)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
