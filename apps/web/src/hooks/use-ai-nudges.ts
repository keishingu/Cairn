import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FEATURE_FLAGS } from '@cairn/shared'
import type { AiNudgeDto } from '@/app/api/ai/nudges/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

export const aiNudgeQueryKey = (channelId: string | null) => ['ai-nudges', channelId] as const

async function fetchAiNudges(channelId: string): Promise<AiNudgeDto[]> {
  const res = await fetchWithAuth(`/api/ai/nudges?channelId=${encodeURIComponent(channelId)}`)
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? 'ナッジの取得に失敗しました')
  }
  return res.json()
}

export function useAiNudges(channelId: string | null) {
  return useQuery({
    queryKey: aiNudgeQueryKey(channelId),
    queryFn: () => fetchAiNudges(channelId!),
    enabled: FEATURE_FLAGS.aiPmo && channelId !== null,
  })
}

export function useAiNudgeFeedback(channelId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, feedback }: { id: string; feedback: 'later' | 'not_helpful' }) => {
      const res = await fetchWithAuth(`/api/ai/nudges/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'フィードバックの保存に失敗しました')
      }
      return id
    },
    onMutate: async ({ id }) => {
      const key = aiNudgeQueryKey(channelId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<AiNudgeDto[]>(key)
      queryClient.setQueryData<AiNudgeDto[]>(
        key,
        (current) => current?.filter((nudge) => nudge.id !== id) ?? [],
      )
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(aiNudgeQueryKey(channelId), context.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: aiNudgeQueryKey(channelId) })
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
