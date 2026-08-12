import { describe, expect, it, vi } from 'vitest'
import {
  ACCOUNT_DELETED_LOGIN_ROUTE,
  finishNativeAccountDeletion,
} from '../lib/account-deletion-bridge'
import { webPath } from '../lib/webview-path'

describe('アプリ内WebViewのパス変換', () => {
  it('webview=1 を相対パスへ付与する', () => {
    expect(webPath('/ai')).toBe('/ai?webview=1')
  })

  it('既存クエリを保ったまま webview=1 を追加する', () => {
    expect(webPath('/projects?open=p1')).toBe('/projects?open=p1&webview=1')
  })
})

describe('WebViewからのアカウント削除通知', () => {
  it('削除完了メッセージ付きのログイン画面へ戻す', () => {
    expect(ACCOUNT_DELETED_LOGIN_ROUTE).toBe('/(auth)/login?accountDeleted=1')
  })

  it('ネイティブセッションを削除してログイン画面へ戻す', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)
    const navigateToLogin = vi.fn()

    await finishNativeAccountDeletion(signOut, navigateToLogin)

    expect(signOut).toHaveBeenCalledOnce()
    expect(navigateToLogin).toHaveBeenCalledOnce()
  })

  it('Authユーザー削除後にsignOutが失敗してもログイン画面へ戻す', async () => {
    const signOut = vi.fn().mockRejectedValue(new Error('user already deleted'))
    const navigateToLogin = vi.fn()

    await expect(finishNativeAccountDeletion(signOut, navigateToLogin)).resolves.toBeUndefined()
    expect(navigateToLogin).toHaveBeenCalledOnce()
  })
})
