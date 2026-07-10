import { useQuery } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { MessageDto } from '@/app/api/channels/[channelId]/messages/route'
import type { MessageSearchResultDto } from '@/app/api/search/messages/route'

export const chatSearchQueryKeys = {
  channelMessages: (channelId: string, query: string) => ['message-search', channelId, query] as const,
  globalMessages: (query: string) => ['global-message-search', query] as const,
}

export function useChannelMessageSearch(channelId: string, query: string) {
  return useQuery<MessageDto[]>({
    queryKey: chatSearchQueryKeys.channelMessages(channelId, query),
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/channels/${channelId}/messages/search?q=${encodeURIComponent(query)}`)
      if (!res.ok) throw new Error('fetch failed')
      return res.json() as Promise<MessageDto[]>
    },
    enabled: query.length >= 1,
  })
}

export function useGlobalMessageSearch(query: string) {
  return useQuery<MessageSearchResultDto[]>({
    queryKey: chatSearchQueryKeys.globalMessages(query),
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/search/messages?q=${encodeURIComponent(query)}`)
      if (!res.ok) throw new Error('fetch failed')
      return res.json() as Promise<MessageSearchResultDto[]>
    },
    enabled: query.length >= 1,
  })
}
