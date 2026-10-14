import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createReactionHistoryStore } from '../lib/reaction-history'

const store = createReactionHistoryStore(AsyncStorage)
const queryKey = ['reaction-history']

export function useReactionHistory(userId: string | undefined) {
  const client = useQueryClient()
  const query = useQuery({
    queryKey,
    queryFn: () => store.read(userId!),
    enabled: !!userId,
    staleTime: 0,
  })
  const ownerQuery = client.getQueryCache().find({ queryKey })
  return {
    recent: query.data ?? [],
    error: query.isError,
    async record(emoji: string) {
      if (!userId) return
      const recent = await store.record(userId, emoji)
      // Account switches clear queries on the same client. Never repopulate a new
      // account's history when an earlier account's reaction finishes late.
      if (client.getQueryCache().find({ queryKey }) !== ownerQuery) return
      await client.cancelQueries({ queryKey })
      if (client.getQueryCache().find({ queryKey }) === ownerQuery)
        client.setQueryData(queryKey, recent)
    },
  }
}
