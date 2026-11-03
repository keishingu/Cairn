import { chatLinkTarget } from './chat-link'

export const WEBVIEW_ORIGIN_WHITELIST = ['http://*', 'https://*', 'about:*']

export type WebViewNavigationDecision =
  | 'allow'
  | 'open-native-chat'
  | 'open-external'
  | 'block'

function isVercelToolbarUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname
    return hostname === 'vercel.live' || hostname.endsWith('.vercel.live')
  } catch {
    return false
  }
}

function isNativeAuxUrl(url: string): boolean {
  try {
    return new URL(url).searchParams.get('nativeAux') === '1'
  } catch {
    return false
  }
}

export function decideWebViewNavigation({
  url,
  trustedOrigin,
  allowChatRoutes,
  isTopFrame,
  isAndroid = false,
  development = false,
}: {
  url: string
  trustedOrigin: string
  allowChatRoutes: boolean
  isTopFrame: boolean | undefined
  isAndroid?: boolean
  /** 開発ビルドか。PC のブラウザからコピーした localhost のチャットリンクも、接続先の Web と同じとみなす */
  development?: boolean
}): WebViewNavigationDecision {
  if (url === 'about:blank' || url.startsWith('about:')) return 'allow'
  if (isVercelToolbarUrl(url)) return 'block'

  // 行き先は呼び出し側が chatLinkTarget で同じ規則から取り出す。
  // チャット補助画面（allowChatRoutes）でも WebView に読み込むのは補助画面の URL（nativeAux=1）だけで、
  // そこから開くチャンネル・メッセージはネイティブのチャットで開く
  if (chatLinkTarget(url, trustedOrigin, development) && !(allowChatRoutes && isNativeAuxUrl(url))) {
    return 'open-native-chat'
  }

  if (url === trustedOrigin || url.startsWith(`${trustedOrigin}/`)) return 'allow'
  // Android の onShouldStartLoadWithRequest は main-frame navigation のみを通知する一方、
  // iOS 専用の isTopFrame を含まない。iOS では false の iframe を引き続き拒否する。
  const isMainFrame = isTopFrame ?? isAndroid
  if (isMainFrame && (url.startsWith('https://') || url.startsWith('http://'))) {
    return 'open-external'
  }
  return 'block'
}
