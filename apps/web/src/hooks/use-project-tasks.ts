import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { TaskDto } from '@/app/api/tasks/route'

type TaskScope = { projectId: string } | { channelId: string }

function taskScope(scope: TaskScope) {
  return 'projectId' in scope
    ? { queryKey: ['tasks', scope.projectId] as const, query: `projectId=${scope.projectId}` }
    : { queryKey: ['tasks', 'channel', scope.channelId] as const, query: `channelId=${scope.channelId}` }
}

export function useTasksByScope(scope: TaskScope) {
  const queryClient = useQueryClient()
  const { queryKey, query: search } = taskScope(scope)

  const query = useQuery<TaskDto[]>({
    queryKey,
    queryFn: () => fetchWithAuth(`/api/tasks?${search}`).then(r => r.json()),
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
      await queryClient.cancelQueries({ queryKey })
      const prev = queryClient.getQueryData<TaskDto[]>(queryKey)
      queryClient.setQueryData<TaskDto[]>(
        queryKey,
        old => old?.map(t => t.id === id ? { ...t, status: newStatus } : t) ?? [],
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey })
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      // プロジェクトのタスク進捗（taskCount/completedTaskCount）も更新する
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  return { ...query, toggleMutation }
}

export function useProjectTasks(projectId: string) {
  return useTasksByScope({ projectId })
}

export function useCreateTask(projectId: string, onSuccess: () => void) {
  return useCreateTaskByScope({ projectId }, onSuccess)
}

export function useCreateTaskByScope(scope: TaskScope, onSuccess: () => void) {
  const queryClient = useQueryClient()
  const { queryKey } = taskScope(scope)
  return useMutation({
    mutationFn: async (data: { title: string; priority: string; dueDate?: string; assigneeId?: string }) => {
      const res = await fetchWithAuth('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, ...scope }),
      })
      if (!res.ok) throw new Error('Failed to create task')
      return res.json() as Promise<TaskDto>
    },
    onSuccess: (newTask) => {
      queryClient.setQueryData<TaskDto[]>(queryKey, old =>
        old ? [newTask, ...old] : [newTask],
      )
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      onSuccess()
    },
  })
}
