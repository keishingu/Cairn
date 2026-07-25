export type NativeWebViewWorkspaceState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; workspaceId: string }

interface NativeWebViewWorkspaceSnapshot {
  workspaceId?: string | undefined
  isPending: boolean
  error: unknown
}

const DEFAULT_ERROR_MESSAGE = 'ワークスペース情報の取得に失敗しました'

export function resolveNativeWebViewWorkspaceState({
  workspaceId,
  isPending,
  error,
}: NativeWebViewWorkspaceSnapshot): NativeWebViewWorkspaceState {
  // 再取得中・再取得失敗でも既存データがあればWebViewを維持する。
  // 初回取得でworkspace IDがまだ無い場合だけ、WebViewの生成を待つ。
  if (workspaceId) return { status: 'ready', workspaceId }
  if (isPending) return { status: 'loading' }

  return {
    status: 'error',
    message: error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE,
  }
}
