import { useCurrentUser } from './use-current-user'
import { useSidebarWorkspace } from './use-sidebar'
import type { DraftScope } from '@/lib/drafts/draft-store'

/**
 * 下書きの名前空間（現在のユーザー × ワークスペース）。
 * どちらかを取得できない間・取得に失敗したときは scope が null で、下書きは使わない（下書き機能が無いのと同じ挙動）。
 * `settled` は「scope が確定した、または取得に失敗して諦めた」こと。設定欄は settled になるまで復元を待つ。
 */
export function useDraftScope(): { scope: DraftScope | null; settled: boolean } {
  const user = useCurrentUser()
  const workspace = useSidebarWorkspace()
  const userId = user.data?.id
  const workspaceId = workspace.data?.id
  if (userId && workspaceId) return { scope: { userId, workspaceId }, settled: true }
  return { scope: null, settled: user.isError || workspace.isError }
}
