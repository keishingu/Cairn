import { describe, expect, it } from 'vitest'
import { NATIVE_HEADER_BACK_SCRIPT, parseNativeHeaderDescriptor } from './native-header-bridge'

describe('WebViewとネイティブヘッダーの連携', () => {
  it('タイトル・補足・戻る可否を検証する', () => {
    expect(
      parseNativeHeaderDescriptor({
        title: '設定',
        subtitle: 'アカウント',
        canGoBack: true,
      }),
    ).toEqual({ title: '設定', subtitle: 'アカウント', canGoBack: true })
  })

  it('不正なメッセージを無視する', () => {
    expect(parseNativeHeaderDescriptor({ title: 1, canGoBack: true })).toBeNull()
    expect(parseNativeHeaderDescriptor({ title: '設定', canGoBack: 'yes' })).toBeNull()
  })

  it('WebViewへ戻る操作イベントを送る', () => {
    expect(NATIVE_HEADER_BACK_SCRIPT).toContain('cairn:native-header-back')
  })
})
