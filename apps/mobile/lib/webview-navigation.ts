export const WEBVIEW_ORIGIN_WHITELIST = ['http://*', 'https://*', 'about:*']

export type WebViewNavigationDecision = 'allow' | 'open-native-chat' | 'block'

export function decideWebViewNavigation({
  url,
  trustedOrigin,
  allowChatRoutes,
}: {
  url: string
  trustedOrigin: string
  allowChatRoutes: boolean
}): WebViewNavigationDecision {
  if (url === 'about:blank' || url.startsWith('about:')) return 'allow'

  const chatsPath = `${trustedOrigin}/chats`
  if (
    !allowChatRoutes &&
    (url === chatsPath || url.startsWith(`${chatsPath}/`) || url.startsWith(`${chatsPath}?`))
  ) {
    return 'open-native-chat'
  }

  if (url === trustedOrigin || url.startsWith(`${trustedOrigin}/`)) return 'allow'
  return 'block'
}
