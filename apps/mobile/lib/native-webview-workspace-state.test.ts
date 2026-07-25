import { describe, expect, it } from 'vitest'
import { resolveNativeWebViewWorkspaceState } from './native-webview-workspace-state'

describe('ネイティブWebViewのワークスペース準備状態', () => {
  it('初回取得中はWebViewを生成せず待機する', () => {
    expect(
      resolveNativeWebViewWorkspaceState({
        isPending: true,
        error: null,
      }),
    ).toEqual({ status: 'loading' })
  })

  it('初回取得に失敗した場合は取得エラーを表示する', () => {
    expect(
      resolveNativeWebViewWorkspaceState({
        isPending: false,
        error: new Error('ワークスペース情報の取得に失敗しました (500)'),
      }),
    ).toEqual({
      status: 'error',
      message: 'ワークスペース情報の取得に失敗しました (500)',
    })
  })

  it('原因不明でワークスペースが無い場合も明示的なエラーにする', () => {
    expect(
      resolveNativeWebViewWorkspaceState({
        isPending: false,
        error: null,
      }),
    ).toEqual({
      status: 'error',
      message: 'ワークスペース情報の取得に失敗しました',
    })
  })

  it('既存データがあれば再取得中や再取得エラーでもWebViewを維持する', () => {
    expect(
      resolveNativeWebViewWorkspaceState({
        workspaceId: 'workspace-1',
        isPending: true,
        error: new Error('background refetch failed'),
      }),
    ).toEqual({ status: 'ready', workspaceId: 'workspace-1' })
  })

  it('ワークスペースIDの変更を再生成用のkeyへ反映する', () => {
    const before = resolveNativeWebViewWorkspaceState({
      workspaceId: 'workspace-1',
      isPending: false,
      error: null,
    })
    const after = resolveNativeWebViewWorkspaceState({
      workspaceId: 'workspace-2',
      isPending: false,
      error: null,
    })

    expect(before).toEqual({ status: 'ready', workspaceId: 'workspace-1' })
    expect(after).toEqual({ status: 'ready', workspaceId: 'workspace-2' })
  })
})
