import { STORAGE_KEYS } from './storage-keys'

interface ResolveInitialChatChannelIdArgs {
  availableChannelIds: string[]
  fallbackChannelId: string | null
  rememberedChannelId: string | null
}

export function resolveInitialChatChannelId({
  availableChannelIds,
  fallbackChannelId,
  rememberedChannelId,
}: ResolveInitialChatChannelIdArgs) {
  if (rememberedChannelId && availableChannelIds.includes(rememberedChannelId)) {
    return rememberedChannelId
  }
  return fallbackChannelId
}

export function getLastVisitedChatChannelId() {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(STORAGE_KEYS.chat_last_channel_id)
}

export function setLastVisitedChatChannelId(channelId: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEYS.chat_last_channel_id, channelId)
}
