import { useQuery } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { MessageDto } from '@/app/api/channels/[channelId]/messages/route'
import type { MessageSearchResultDto } from '@/app/api/search/messages/route'
import type { ProjectDto } from '@/app/api/projects/route'

export function useChannelMessageSearch(channelId: string, query: string) {
  return useQuery<MessageDto[]>({
    queryKey: ['message-search', channelId, query],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/channels/${channelId}/messages/search?q=${encodeURIComponent(query)}`)
      if (!res.ok) throw new Error('fetch failed')
      return res.json()
    },
    enabled: query.length >= 1,
  })
}

export function useGlobalMessageSearch(query: string) {
  return useQuery<MessageSearchResultDto[]>({
    queryKey: ['global-message-search', query],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/search/messages?q=${encodeURIComponent(query)}`)
      if (!res.ok) throw new Error('fetch failed')
      return res.json()
    },
    enabled: query.length >= 1,
  })
}

export function useChatProjects(enabled: boolean) {
  return useQuery<ProjectDto[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/projects')
      if (!res.ok) throw new Error('fetch failed')
      return res.json()
    },
    enabled,
  })
}
