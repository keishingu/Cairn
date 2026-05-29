import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api-fetch'

export interface TaskDto {
  id: string
  projectId: string
  projectTitle: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
  priority: 'high' | 'medium' | 'low'
  dueDate: string | null
  assigneeName: string | null
}

export function useTasks() {
  return useQuery<TaskDto[]>({
    queryKey: ['tasks'],
    queryFn: async () => {
      const res = await apiFetch('/api/tasks')
      if (!res.ok) throw new Error(`タスクの取得に失敗しました (${res.status})`)
      return res.json() as Promise<TaskDto[]>
    },
  })
}

export function useUpdateTaskStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskDto['status'] }) => {
      const res = await apiFetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error(`タスクの更新に失敗しました (${res.status})`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}
