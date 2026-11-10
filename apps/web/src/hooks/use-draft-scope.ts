import React from 'react'
import { useCurrentUser } from './use-current-user'
import { useSidebarWorkspace } from './use-sidebar'
import { clearDraftsOfOtherUsers, type DraftScope } from '@/lib/drafts/draft-store'

/**
 * 下書きの名前空間（現在のユーザー × ワークスペース）。
 * どちらかを取得できない間・取得に失敗したときは scope が null で、下書きは使わない（下書き機能が無いのと同じ挙動）。
 * `settled` は「scope が確定した、または取得に失敗して諦めた」こと。設定欄は settled になるまで復元を待つ。
 */
/** 掃除済みのユーザー ID。ユーザーごとにページの寿命の間1回だけ行う。 */
let sweptForUserId: string | null = null

export function useDraftScope(): { scope: DraftScope | null; settled: boolean } {
  const user = useCurrentUser()
  const workspace = useSidebarWorkspace()
  const userId = user.data?.id
  const workspaceId = workspace.data?.id
  // 認証中のユーザー以外の下書き（セッション切れ・同じ端末での別ユーザーのサインイン）を消す
  React.useEffect(() => {
    if (!userId || sweptForUserId === userId) return
    sweptForUserId = userId
    clearDraftsOfOtherUsers(userId)
  }, [userId])
  if (userId && workspaceId) return { scope: { userId, workspaceId }, settled: true }
  return { scope: null, settled: user.isError || workspace.isError }
}
