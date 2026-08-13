import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
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

interface PatchProjectMilestoneVariables {
  projectId: string
  id: string
  input: PatchMilestoneInput
}

async function parseError(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({})) as { error?: string }
  return new Error(data.error ?? fallback)
}

async function patchProjectMilestone({ projectId, id, input }: PatchProjectMilestoneVariables) {
  const res = await fetchWithAuth(`/api/projects/${projectId}/milestones/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw await parseError(res, 'マイルストーンの更新に失敗しました')
  return res.json() as Promise<MilestoneDto>
}

function updateMilestoneCache(queryClient: QueryClient, projectId: string, updated: MilestoneDto) {
  const queryKey = ['project-milestones', projectId] as const
  queryClient.setQueryData<MilestoneDto[]>(
    queryKey,
    old => old?.map(milestone => milestone.id === updated.id ? updated : milestone) ?? [updated],
  )
  void queryClient.invalidateQueries({ queryKey })
  void queryClient.invalidateQueries({ queryKey: chatQueryKeys.projectChannels })
}

/** プロジェクトが行ごとに変わる画面から、単一の更新Mutationを使うためのHook。 */
export function usePatchProjectMilestone() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: patchProjectMilestone,
    onSuccess: (updated, variables) => updateMilestoneCache(queryClient, variables.projectId, updated),
  })
}

export function useCreateProjectMilestone(projectId: string) {
  const queryClient = useQueryClient()
  const queryKey = ['project-milestones', projectId] as const

  return useMutation({
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
      void queryClient.invalidateQueries({ queryKey })
      void queryClient.invalidateQueries({ queryKey: chatQueryKeys.projectChannels })
    },
  })
}

export function useProjectMilestones(projectId: string) {
  const queryClient = useQueryClient()
  const queryKey = ['project-milestones', projectId] as const
  const createMutation = useCreateProjectMilestone(projectId)

  const query = useQuery<MilestoneDto[]>({
    queryKey,
    refetchOnMount: 'always',
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

  const patchMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchMilestoneInput }) => patchProjectMilestone({ projectId, id, input }),
    onSuccess: updated => updateMilestoneCache(queryClient, projectId, updated),
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
