import { describe, expect, it, vi } from 'vitest'
import {
  ACCOUNT_DELETED_LOGIN_ROUTE,
  finishNativeAccountDeletion,
} from '../lib/account-deletion-bridge'
import { mobileHandoffUrl, webPath } from '../lib/webview-path'
import AsyncStorage from '@react-native-async-storage/async-storage'

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { removeItem: vi.fn().mockResolvedValue(undefined) },
}))

describe('アプリ内WebViewのパス変換', () => {
  it('webview=1 を相対パスへ付与する', () => {
    expect(webPath('/ai')).toBe('/ai?webview=1')
  })

  it('既存クエリを保ったまま webview=1 を追加する', () => {
    expect(webPath('/projects?open=p1')).toBe('/projects?open=p1&webview=1')
  })

  it('active workspaceがない設定画面でも認証ハンドオフURLを作る', () => {
    expect(mobileHandoffUrl('https://oss-cairn.com', '/settings', 'token')).toBe(
      'https://oss-cairn.com/auth/mobile-handoff?redirect=%2Fsettings%3Fwebview%3D1#th=token',
    )
  })
})

describe('WebViewからのアカウント削除通知', () => {
  it('削除完了メッセージ付きのログイン画面へ戻す', () => {
    expect(ACCOUNT_DELETED_LOGIN_ROUTE).toBe('/(auth)/login?accountDeleted=1')
  })

  it('ネイティブセッションを削除してログイン画面へ戻す', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)
    const navigateToLogin = vi.fn()

    await finishNativeAccountDeletion('user-1', signOut, navigateToLogin)

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
      'cairn:offline-message-queue:v1:user-1',
    )
    expect(signOut).toHaveBeenCalledOnce()
    expect(navigateToLogin).toHaveBeenCalledOnce()
  })

  it('Authユーザー削除後にsignOutが失敗してもログイン画面へ戻す', async () => {
    const signOut = vi.fn().mockRejectedValue(new Error('user already deleted'))
    const navigateToLogin = vi.fn()

    await expect(
      finishNativeAccountDeletion('user-1', signOut, navigateToLogin),
    ).resolves.toBeUndefined()
    expect(navigateToLogin).toHaveBeenCalledOnce()
  })
})
