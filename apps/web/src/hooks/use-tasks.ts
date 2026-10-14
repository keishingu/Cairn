import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UpdateTaskInput } from '@cairn/shared'
import type { TaskDto } from '@/app/api/tasks/route'
import type { TaskDetailDto } from '@/app/api/tasks/[id]/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { useT } from '@/components/locale-provider'

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

async function errorMessageFrom(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({})) as { error?: unknown }
  return typeof body.error === 'string' ? body.error : fallback
}

// 詳細のキャッシュは ['tasks'] 配下に置き、一覧と同じ invalidate・Realtime（tasks broadcast）で更新する。
const taskDetailKey = (id: string) => ['tasks', 'detail', id] as const

export function useTaskDetail(taskId: string | null) {
  const t = useT()
  return useQuery<TaskDetailDto>({
    queryKey: taskDetailKey(taskId ?? ''),
    enabled: taskId != null,
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/tasks/${taskId}`)
      if (!res.ok) throw new Error(await errorMessageFrom(res, t('Could not load the task')))
      return res.json() as Promise<TaskDetailDto>
    },
  })
}

export function usePatchTask() {
  const t = useT()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateTaskInput }) => {
      const res = await fetchWithAuth(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(await errorMessageFrom(res, t('Could not update the task')))
    },
    // 変更直後に入力欄が元の値へ戻って見えないよう、詳細キャッシュへ先に反映する。失敗したら戻す。
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: taskDetailKey(id) })
      const prev = queryClient.getQueryData<TaskDetailDto>(taskDetailKey(id))
      if (prev) {
        const next: TaskDetailDto = { ...prev }
        if (patch.title !== undefined) next.title = patch.title
        if (patch.priority !== undefined) next.priority = patch.priority
        if (patch.status !== undefined) next.status = patch.status
        if (patch.dueDate !== undefined) next.dueDate = patch.dueDate
        if (patch.description !== undefined) {
          next.description = patch.description
          next.hasDescription = patch.description != null && patch.description !== ''
        }
        if (patch.assigneeId !== undefined) {
          next.assigneeId = patch.assigneeId
          // 新しい担当者の名前は再取得まで分からないので、解除のときだけ表示も消す
          if (patch.assigneeId === null) {
            next.assigneeName = null
            next.assigneeAvatarUrl = null
          }
        }
        queryClient.setQueryData<TaskDetailDto>(taskDetailKey(id), next)
      }
      return { prev }
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(taskDetailKey(id), ctx.prev)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useDeleteTask() {
  const t = useT()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetchWithAuth(`/api/tasks/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await errorMessageFrom(res, t('Could not delete the task')))
    },
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: taskDetailKey(id) })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
