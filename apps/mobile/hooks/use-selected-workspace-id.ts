import React from 'react'
import { getSelectedWorkspaceId } from '../lib/workspace-selection'

// 添付の取得（Image の source・ダウンロード）は apiFetch を通らないため、選択中のワークスペースを
// 画面側で読んで渡す。読み終わる前に取得すると既定のワークスペースで判定されて 403 になるので、
// ready になるまで添付を取りに行かない
export function useSelectedWorkspaceId(userId: string | undefined): {
  workspaceId: string | null
  ready: boolean
} {
  const [loaded, setLoaded] = React.useState<{ userId: string; workspaceId: string | null } | null>(
    null,
  )

  React.useEffect(() => {
    if (!userId) return
    let cancelled = false
    getSelectedWorkspaceId(userId)
      .then((workspaceId) => {
        if (!cancelled) setLoaded({ userId, workspaceId })
      })
      .catch((error: unknown) => {
        console.error('[workspace] 選択中のワークスペースを読み込めませんでした:', error)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const ready = userId !== undefined && loaded?.userId === userId
  return { workspaceId: ready ? loaded.workspaceId : null, ready }
}
