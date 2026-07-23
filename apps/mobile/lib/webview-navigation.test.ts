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
      }),
    ).toBe('allow')
  })

  it('Vercel Toolbarを含む外部URLを拒否する', () => {
    expect(
      decideWebViewNavigation({
        url: 'https://vercel.live/_next-live/feedback/feedback.html?dpl=dpl_example',
        trustedOrigin,
        allowChatRoutes: false,
      }),
    ).toBe('block')
  })

  it('Web側のチャット導線をネイティブチャットへ委譲する', () => {
    expect(
      decideWebViewNavigation({
        url: `${trustedOrigin}/chats/channel-1`,
        trustedOrigin,
        allowChatRoutes: false,
      }),
    ).toBe('open-native-chat')
  })

  it('チャット補助画面ではチャットURLをWebView内で許可する', () => {
    expect(
      decideWebViewNavigation({
        url: `${trustedOrigin}/chats/search`,
        trustedOrigin,
        allowChatRoutes: true,
      }),
    ).toBe('allow')
  })
})
