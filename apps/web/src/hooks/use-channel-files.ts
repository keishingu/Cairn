import { useQuery } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { ChannelFileDto } from '@/app/api/channels/[channelId]/files/route'

export function useChannelFiles(channelId: string | null) {
  return useQuery<ChannelFileDto[]>({
    queryKey: ['channel-files', channelId],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/channels/${channelId}/files`)
      if (!res.ok) throw new Error('Failed to fetch files')
      return res.json() as Promise<ChannelFileDto[]>
    },
    enabled: !!channelId,
  })
}
