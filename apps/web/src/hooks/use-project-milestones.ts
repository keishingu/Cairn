import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { chatQueryKeys } from '@/lib/chat/client'
import type { MilestoneDto } from '@/app/api/projects/[id]/milestones/route'

export interface CreateMilestoneInput {
  title: string
  description?: string
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
}

export interface PatchMilestoneInput {
  title?: string
  description?: string | null
  startDate?: string | null
  endDate?: string | null
  startTime?: string | null
  endTime?: string | null
  completed?: boolean
}

async function parseError(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({})) as { error?: string }
  return new Error(data.error ?? fallback)
}

export function useProjectMilestones(projectId: string) {
  const queryClient = useQueryClient()
  const queryKey = ['project-milestones', projectId] as const

  const query = useQuery<MilestoneDto[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/projects/${projectId}/milestones`)
      if (!res.ok) throw await parseError(res, 'マイルストーンの取得に失敗しました')
      return res.json() as Promise<MilestoneDto[]>
    },
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey })
    void queryClient.invalidateQueries({ queryKey: chatQueryKeys.projectChannels })
  }

  const createMutation = useMutation({
    mutationFn: async (input: CreateMilestoneInput) => {
      const res = await fetchWithAuth(`/api/projects/${projectId}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw await parseError(res, 'マイルストーンの作成に失敗しました')
      return res.json() as Promise<MilestoneDto>
    },
    onSuccess: (created) => {
      queryClient.setQueryData<MilestoneDto[]>(queryKey, old => old ? [...old, created] : [created])
      invalidate()
    },
  })

  const patchMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: PatchMilestoneInput }) => {
      const res = await fetchWithAuth(`/api/projects/${projectId}/milestones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw await parseError(res, 'マイルストーンの更新に失敗しました')
      return res.json() as Promise<MilestoneDto>
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<MilestoneDto[]>(
        queryKey,
        old => old?.map(m => m.id === updated.id ? updated : m) ?? [updated],
      )
      invalidate()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetchWithAuth(`/api/projects/${projectId}/milestones/${id}`, { method: 'DELETE' })
      if (!res.ok) throw await parseError(res, 'マイルストーンの削除に失敗しました')
      return id
    },
    onSuccess: (id) => {
      queryClient.setQueryData<MilestoneDto[]>(queryKey, old => old?.filter(m => m.id !== id) ?? [])
      invalidate()
    },
  })

  return { ...query, createMutation, patchMutation, deleteMutation }
}
