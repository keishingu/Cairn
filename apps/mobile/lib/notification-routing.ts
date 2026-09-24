type NotificationType = 'mention' | 'dm' | 'task' | 'file' | 'status' | 'invite' | 'reaction' | 'ai'

export interface NotificationRouteInput {
  type: NotificationType
  data: Record<string, string> | null
}

const SCREEN_PATHS = [
  '/(app)/chats',
  '/(app)/tasks',
  '/(app)/ai',
  '/(app)/files',
  '/(app)/gallery',
  '/(app)/members',
  '/(app)/settings',
  '/(app)/projects',
  '/(app)/notifications',
] as const

export type NotificationScreenPath = (typeof SCREEN_PATHS)[number]

export type NotificationDestination =
  | { kind: 'channel'; channelId: string }
  | { kind: 'screen'; path: NotificationScreenPath }

const CHANNEL_NOTIFICATION_TYPES = new Set<NotificationType>(['mention', 'dm', 'file', 'reaction'])

const URL_SCREENS: Array<{ prefix: string; path: NotificationScreenPath }> = [
  { prefix: '/tasks', path: '/(app)/tasks' },
  { prefix: '/ai', path: '/(app)/ai' },
  { prefix: '/files', path: '/(app)/files' },
  { prefix: '/gallery', path: '/(app)/gallery' },
  { prefix: '/members', path: '/(app)/members' },
  { prefix: '/settings', path: '/(app)/settings' },
  { prefix: '/projects', path: '/(app)/projects' },
]

function screen(path: NotificationScreenPath): NotificationDestination {
  return { kind: 'screen', path }
}

function channel(channelId: string): NotificationDestination {
  return { kind: 'channel', channelId }
}

export function channelIdFromChatUrl(url: string): string | null {
  const match = /^\/chats\/([^/?#]+)/.exec(url)
  const channelId = match?.[1]
  if (!channelId) return null
  try {
    return decodeURIComponent(channelId)
  } catch {
    return channelId
  }
}

function screenFromUrl(url: string): NotificationDestination | null {
  if (url.startsWith('/chat')) return screen('/(app)/chats')
  const matched = URL_SCREENS.find(
    ({ prefix }) => url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`),
  )
  return matched ? screen(matched.path) : null
}

export function routeFromNotification(item: NotificationRouteInput): NotificationDestination {
  const url = item.data?.['url']
  const channelId = item.data?.['channelId']

  // タスクカードはネイティブのチャットに無い。タスク付き AI 通知はマイタスクへ送る。
  if (item.type === 'ai' && item.data?.['taskId']) return screen('/(app)/tasks')

  const channelFromUrl = url ? channelIdFromChatUrl(url) : null
  if (channelFromUrl) return channel(channelFromUrl)
  if (CHANNEL_NOTIFICATION_TYPES.has(item.type) && channelId) return channel(channelId)
  if (item.type === 'ai' && channelId) return channel(channelId)

  if (url) {
    const fromUrl = screenFromUrl(url)
    if (fromUrl) return fromUrl
  }

  if (item.type === 'task') return screen('/(app)/tasks')
  if (CHANNEL_NOTIFICATION_TYPES.has(item.type)) return screen('/(app)/chats')
  return screen('/(app)/projects')
}

export function routeFromPushUrl(url: string | undefined): NotificationDestination | null {
  if (!url) return null
  const channelId = channelIdFromChatUrl(url)
  if (channelId) return channel(channelId)
  return screenFromUrl(url) ?? screen('/(app)/notifications')
}
