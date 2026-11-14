import React from 'react'
import { getSelectedWorkspaceId, subscribeSelectedWorkspace } from '../lib/workspace-selection'

type State =
  | { status: 'loading'; userId: string | undefined }
  | { status: 'ready'; userId: string; workspaceId: string | null }
  | { status: 'error'; userId: string; error: Error }

// 添付の取得（Image の source・ダウンロード）は apiFetch を通らないため、選択中のワークスペースを
// 画面側で読んで渡す。読み終わる前に取得すると既定のワークスペースで判定されて 403 になるので、
// ready になるまで添付を取りに行かない。開いたままの画面でも切り替えに追従するよう、選択の変更を購読する
export function useSelectedWorkspaceId(userId: string | undefined): {
  workspaceId: string | null
  ready: boolean
  error: Error | null
  retry: () => void
} {
  const [state, setState] = React.useState<State>({ status: 'loading', userId })
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    if (!userId) return
    let cancelled = false
    setState({ status: 'loading', userId })
    getSelectedWorkspaceId(userId)
      .then((workspaceId) => {
        if (!cancelled) setState({ status: 'ready', userId, workspaceId })
      })
      .catch((error: unknown) => {
        console.error('[workspace] 選択中のワークスペースを読み込めませんでした:', error)
        if (!cancelled) {
          setState({
            status: 'error',
            userId,
            error: error instanceof Error ? error : new Error(String(error)),
          })
        }
      })
    const unsubscribe = subscribeSelectedWorkspace((changedUserId, workspaceId) => {
      if (!cancelled && changedUserId === userId) setState({ status: 'ready', userId, workspaceId })
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [userId, attempt])

  const retry = React.useCallback(() => setAttempt((value) => value + 1), [])
  const current = state.userId === userId ? state : null
  return {
    workspaceId: current?.status === 'ready' ? current.workspaceId : null,
    ready: current?.status === 'ready',
    error: current?.status === 'error' ? current.error : null,
    retry,
  }
}
