import { channelIdFromChatUrl, messageIdFromChatUrl } from './notification-routing'

/** アプリ内のチャットへのリンクの行き先。ネイティブのチャットで開く */
export type ChatLinkTarget =
  | { kind: 'list' }
  | { kind: 'channel'; channelId: string; messageId?: string }

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * URL が接続先の Web と同じサーバーを指すか。
 * 本番・develop の判定はビルドごとの接続先（`API_BASE_URL`）だけで行い、ドメインを直書きしない。
 * 開発ビルドの接続先は Metro から導いた LAN の IP だが、PC のブラウザでコピーしたリンクは localhost になるため、
 * 開発時に限り同じポートのループバックも同じサーバーとみなす。
 */
export function isAppOrigin(url: URL, appBaseUrl: string, development: boolean): boolean {
  let app: URL
  try {
    app = new URL(appBaseUrl)
  } catch {
    return false
  }
  if (url.origin === app.origin) return true
  if (!development) return false
  return url.protocol === app.protocol && url.port === app.port && LOOPBACK_HOSTNAMES.has(url.hostname)
}

/**
 * リンクが Web の `/chats` を指していれば、ネイティブのチャットでの行き先を返す。
 * 別環境（develop ビルドで本番のリンク等）は DB が別でチャンネルが存在しないため、対象にしない。
 */
export function chatLinkTarget(
  rawUrl: string,
  appBaseUrl: string,
  development: boolean,
): ChatLinkTarget | null {
  const value = rawUrl.trim()
  if (!value) return null

  let url: URL
  try {
    url = new URL(value, appBaseUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!isAppOrigin(url, appBaseUrl, development)) return null

  const { pathname } = url
  if (pathname !== '/chats' && !pathname.startsWith('/chats/')) return null
  if (!/^\/chats\/[^/]+\/?$/.test(pathname)) return { kind: 'list' }

  const channelId = channelIdFromChatUrl(pathname)
  if (!channelId) return { kind: 'list' }
  const messageId = messageIdFromChatUrl(`${pathname}${url.search}`)
  return messageId ? { kind: 'channel', channelId, messageId } : { kind: 'channel', channelId }
}
