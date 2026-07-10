import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreatePollInput } from '@cairn/shared'
import type { PollCreateResponseDto } from '@/app/api/polls/route'
import type { PollDetailDto } from '@/app/api/polls/[id]/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

export const pollQueryKeys = {
  detail: (id: string | null) => ['poll', id] as const,
}

async function fetchPoll(id: string): Promise<PollDetailDto> {
  const res = await fetchWithAuth(`/api/polls/${id}`)
  if (!res.ok) throw new Error('投票の取得に失敗しました')
  return res.json()
}

async function createPoll(input: CreatePollInput): Promise<PollCreateResponseDto> {
  const res = await fetchWithAuth('/api/polls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string | { formErrors?: string[] } }
    if (typeof data.error === 'string') throw new Error(data.error)
    throw new Error('投票の作成に失敗しました')
  }
  return res.json()
}

export function usePoll(id: string | null) {
  return useQuery({
    queryKey: pollQueryKeys.detail(id),
    queryFn: () => fetchPoll(id!),
    enabled: Boolean(id),
  })
}

export function useCreatePoll(channelId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<CreatePollInput, 'channelId'>) =>
      createPoll({ channelId: channelId!, ...input }),
    onSuccess: (created) => {
      if (channelId) {
        void queryClient.invalidateQueries({ queryKey: ['messages', channelId] })
      }
      queryClient.setQueryData<PollDetailDto>(pollQueryKeys.detail(created.messageId), {
        id: created.id,
        channelId: created.channelId,
        messageId: created.messageId,
        question: created.question,
        allowMultiple: created.allowMultiple,
        anonymous: created.anonymous,
        createdBy: '',
        createdAt: created.createdAt,
        options: created.options.map((option) => ({
          ...option,
          voteCount: 0,
          voters: [],
        })),
      })
    },
  })
}
