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

interface TaskListResponse {
  items: TaskDto[]
  nextCursor: string | null
}

const TASKS_PAGE_LIMIT = 200

async function fetchAllTasks(): Promise<TaskDto[]> {
  const items: TaskDto[] = []
  let cursor: string | null = null

  do {
    const params = new URLSearchParams({ limit: String(TASKS_PAGE_LIMIT) })
    if (cursor) params.set('cursor', cursor)
    const res = await apiFetch(`/api/tasks?${params.toString()}`)
    if (!res.ok) throw new Error(`タスクの取得に失敗しました (${res.status})`)
    const page = await res.json() as TaskListResponse
    items.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)

  return items
}

export function useTasks() {
  return useQuery<TaskDto[]>({
    queryKey: ['tasks'],
    queryFn: fetchAllTasks,
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
