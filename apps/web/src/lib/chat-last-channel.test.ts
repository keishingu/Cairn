import { beforeEach, describe, expect, it } from 'vitest'
import {
  getLastVisitedChatChannelId,
  resolveInitialChatChannelId,
  setLastVisitedChatChannelId,
} from './chat-last-channel'
import { STORAGE_KEYS } from './storage-keys'

describe('chat-last-channel', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('保存済みチャンネルが候補に含まれる時はそれを優先する', () => {
    expect(resolveInitialChatChannelId({
      rememberedChannelId: 'dm-1',
      availableChannelIds: ['project-1', 'general-1', 'dm-1'],
      fallbackChannelId: 'project-1',
    })).toBe('dm-1')
  })

  it('保存済みチャンネルが見つからない時はフォールバックを使う', () => {
    expect(resolveInitialChatChannelId({
      rememberedChannelId: 'missing',
      availableChannelIds: ['project-1', 'general-1'],
      fallbackChannelId: 'project-1',
    })).toBe('project-1')
  })

  it('前回開いたチャンネルを localStorage に保存して読み出せる', () => {
    setLastVisitedChatChannelId('channel-42')

    expect(localStorage.getItem(STORAGE_KEYS.chat_last_channel_id)).toBe('channel-42')
    expect(getLastVisitedChatChannelId()).toBe('channel-42')
  })

  it('一覧の解決前は保存済みチャンネルが見つからなくてもフォールバックしない', () => {
    expect(resolveInitialChatChannelId({
      rememberedChannelId: 'dm-1',
      availableChannelIds: ['project-1'],
      fallbackChannelId: 'project-1',
      allowFallback: false,
    })).toBeNull()
  })
})
