import { useQuery } from '@tanstack/react-query'
import { useCanUseNetwork } from '../components/offline-message-queue-provider'
import {
  offlineCacheTargetKey,
  resolveOfflineRead,
  shouldReadOfflineCache,
  type OfflineCacheTarget,
  type OfflineRead,
} from '../lib/offline-cache'
import { readOfflineCache } from '../lib/offline-cache-store'
import { useSession } from '../lib/session-context'
import { useSelectedWorkspaceId } from './use-selected-workspace-id'

interface QueryLike<T> {
  data: T[] | undefined
  dataUpdatedAt: number
  error: unknown
  isLoading: boolean
}

/**
 * 画面に出すデータを決める。キャッシュは圏外・取得失敗でデータが無いときだけ読み、
 * 取得結果のクエリには混ぜない（既読化やチャンネル購読が古いデータで動かないように）。
 */
export function useOfflineRead<T>(
  target: OfflineCacheTarget,
  query: QueryLike<T>,
  enabled = true,
): OfflineRead<T[]> {
  const online = useCanUseNetwork()
  const userId = useSession()?.user.id
  const selectedWorkspace = useSelectedWorkspaceId(userId)
  const scopeReady = target.type === 'messages' || selectedWorkspace.ready
  const scopeFailed = !userId || (target.type !== 'messages' && !!selectedWorkspace.error)
  const shouldRead =
    enabled && shouldReadOfflineCache({ online, data: query.data, error: query.error })

  const cacheQuery = useQuery({
    queryKey: ['offline-cache', offlineCacheTargetKey(target), userId, selectedWorkspace.workspaceId],
    queryFn: async () => {
      try {
        return await readOfflineCache<T>(target, {
          userId: userId!,
          workspaceId: selectedWorkspace.workspaceId,
        })
      } catch (error) {
        console.warn('[offline-cache] 端末キャッシュを読み込めませんでした:', error)
        return null
      }
    },
    enabled: shouldRead && !!userId && scopeReady,
    retry: false,
    gcTime: 0,
    networkMode: 'always',
  })

  return resolveOfflineRead<T[]>({
    online,
    data: query.data,
    dataUpdatedAt: query.dataUpdatedAt,
    error: query.error,
    isLoading: query.isLoading,
    cached: !shouldRead || scopeFailed ? null : cacheQuery.data,
  })
}
