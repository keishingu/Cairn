import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { TaskDto, TaskListResponse } from '@/app/api/tasks/route'

const PROJECT_TASKS_PAGE_LIMIT = 200

async function fetchAllProjectTasks(projectId: string): Promise<TaskDto[]> {
  const items: TaskDto[] = []
  let cursor: string | null = null

  do {
    const params = new URLSearchParams({ projectId, limit: String(PROJECT_TASKS_PAGE_LIMIT) })
    if (cursor) params.set('cursor', cursor)
    const res = await fetchWithAuth(`/api/tasks?${params.toString()}`)
    if (!res.ok) throw new Error('fetch failed')
    const page = await res.json() as TaskListResponse
    items.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)

  return items
}

export function useProjectTasks(projectId: string) {
  const queryClient = useQueryClient()

  const query = useQuery<TaskDto[]>({
    queryKey: ['tasks', projectId],
    queryFn: () => fetchAllProjectTasks(projectId),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: TaskDto['status'] }) => {
      const res = await fetchWithAuth(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error('Failed')
    },
    onMutate: async ({ id, newStatus }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', projectId] })
      const prev = queryClient.getQueryData<TaskDto[]>(['tasks', projectId])
      queryClient.setQueryData<TaskDto[]>(
        ['tasks', projectId],
        old => old?.map(t => t.id === id ? { ...t, status: newStatus } : t) ?? [],
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['tasks', projectId], ctx.prev)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      // プロジェクトのタスク進捗（taskCount/completedTaskCount）も更新する
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  return { ...query, toggleMutation }
}

export function useCreateTask(projectId: string, onSuccess: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { title: string; priority: string; dueDate?: string }) => {
      const res = await fetchWithAuth('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, projectId }),
      })
      if (!res.ok) throw new Error('Failed to create task')
      return res.json() as Promise<TaskDto>
    },
    onSuccess: (newTask) => {
      queryClient.setQueryData<TaskDto[]>(['tasks', projectId], old =>
        old ? [newTask, ...old] : [newTask],
      )
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      onSuccess()
    },
  })
}
