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

export function decideWebViewNavigation({
  url,
  trustedOrigin,
  allowChatRoutes,
  isTopFrame,
  isAndroid = false,
}: {
  url: string
  trustedOrigin: string
  allowChatRoutes: boolean
  isTopFrame: boolean | undefined
  isAndroid?: boolean
}): WebViewNavigationDecision {
  if (url === 'about:blank' || url.startsWith('about:')) return 'allow'
  if (isVercelToolbarUrl(url)) return 'block'

  const chatsPath = `${trustedOrigin}/chats`
  if (
    !allowChatRoutes &&
    (url === chatsPath || url.startsWith(`${chatsPath}/`) || url.startsWith(`${chatsPath}?`))
  ) {
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
