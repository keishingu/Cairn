type NotificationType = 'mention' | 'dm' | 'task' | 'file' | 'status' | 'invite' | 'reaction' | 'ai'

export interface NotificationRouteInput {
  type: NotificationType
  data: Record<string, string> | null
}

export function routeFromNotification(item: NotificationRouteInput): string {
  const url = item.data?.['url']
  if (url?.startsWith('/chat')) return '/(app)/chats'
  if (url?.startsWith('/tasks')) return '/(app)/tasks'
  if (url?.startsWith('/ai')) return '/(app)/ai'
  if (url?.startsWith('/files')) return '/(app)/files'
  if (url?.startsWith('/gallery')) return '/(app)/gallery'
  if (url?.startsWith('/members')) return '/(app)/members'
  if (url?.startsWith('/settings')) return '/(app)/settings'

  const channelId = item.data?.['channelId']
  if ((item.type === 'mention' || item.type === 'dm' || item.type === 'file' || item.type === 'reaction') && channelId) {
    return '/(app)/chats'
  }
  if (item.type === 'task') return '/(app)/tasks'

  return '/(app)/projects'
}
