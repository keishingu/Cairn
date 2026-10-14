import { describe, expect, it } from 'vitest'
import {
  decideWebViewNavigation,
  messageTargetChatPath,
  WEBVIEW_ORIGIN_WHITELIST,
} from './webview-navigation'

const trustedOrigin = 'https://develop.oss-cairn.com'

describe('WebViewのナビゲーション判定', () => {
  it('HTTPとHTTPSをOSへ直接転送せず判定処理へ渡す', () => {
    expect(WEBVIEW_ORIGIN_WHITELIST).toEqual(['http://*', 'https://*', 'about:*'])
  })

  it('信頼済みオリジン内の画面を許可する', () => {
    expect(
      decideWebViewNavigation({
        url: `${trustedOrigin}/projects?webview=1`,
        trustedOrigin,
        allowChatRoutes: false,
        isTopFrame: true,
      }),
    ).toBe('allow')
  })

  it('Vercel Toolbarをトップフレームでも拒否する', () => {
    expect(
      decideWebViewNavigation({
        url: 'https://vercel.live/_next-live/feedback/feedback.html?dpl=dpl_example',
        trustedOrigin,
        allowChatRoutes: false,
        isTopFrame: true,
      }),
    ).toBe('block')
  })

  it('バックグラウンドiframeの外部URLを拒否する', () => {
    expect(
      decideWebViewNavigation({
        url: 'https://example.com/embed',
        trustedOrigin,
        allowChatRoutes: false,
        isTopFrame: false,
      }),
    ).toBe('block')
  })

  it('ユーザーが開いたトップフレームの外部URLをブラウザへ委譲する', () => {
    expect(
      decideWebViewNavigation({
        url: 'https://example.com/document',
        trustedOrigin,
        allowChatRoutes: false,
        isTopFrame: true,
      }),
    ).toBe('open-external')
  })

  it('AndroidではisTopFrameがなくても外部URLをブラウザへ委譲する', () => {
    expect(
      decideWebViewNavigation({
        url: 'https://example.com/document',
        trustedOrigin,
        allowChatRoutes: false,
        isTopFrame: undefined,
        isAndroid: true,
      }),
    ).toBe('open-external')
  })

  it('AndroidでもVercel Toolbarは拒否する', () => {
    expect(
      decideWebViewNavigation({
        url: 'https://vercel.live/_next-live/feedback/feedback.html?dpl=dpl_example',
        trustedOrigin,
        allowChatRoutes: false,
        isTopFrame: undefined,
        isAndroid: true,
      }),
    ).toBe('block')
  })

  it('Web側のチャット導線をネイティブチャットへ委譲する', () => {
    expect(
      decideWebViewNavigation({
        url: `${trustedOrigin}/chats/channel-1`,
        trustedOrigin,
        allowChatRoutes: false,
        isTopFrame: true,
      }),
    ).toBe('open-native-chat')
  })

  it('チャット補助画面ではチャットURLをWebView内で許可する', () => {
    expect(
      decideWebViewNavigation({
        url: `${trustedOrigin}/chats/search`,
        trustedOrigin,
        allowChatRoutes: true,
        isTopFrame: true,
      }),
    ).toBe('allow')
  })
})

describe('messageTargetChatPath', () => {
  const origin = 'https://app.example.com'

  it('特定メッセージを指すチャットURLはチャット補助画面用のパスを返す', () => {
    expect(messageTargetChatPath(`${origin}/chats/channel-1?m=message-1`, origin)).toBe(
      '/chats/channel-1?m=message-1&nativeAux=1',
    )
  })

  it('メッセージ指定のないチャットURLや別オリジンは null を返す', () => {
    expect(messageTargetChatPath(`${origin}/chats/channel-1`, origin)).toBeNull()
    expect(messageTargetChatPath(`${origin}/chats?m=message-1`, origin)).toBeNull()
    expect(messageTargetChatPath(`https://evil.example.com/chats/channel-1?m=message-1`, origin)).toBeNull()
  })
})
