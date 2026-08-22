import { describe, expect, it } from 'vitest'
import {
  decideWebViewNavigation,
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
