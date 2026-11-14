import { describe, expect, it } from 'vitest'
import { CHAT_SEND_ON_ENTER_STORAGE_KEY, chatInputSubmitBehavior, loadChatSendOnEnter, readChatSendOnEnter, saveChatSendOnEnter } from './chat-send-key'

describe('チャットの送信キー設定', () => {
  it('未設定や不明な値はReturn送信を無効にする', () => {
    expect(readChatSendOnEnter(null)).toBe(false)
    expect(readChatSendOnEnter('yes')).toBe(false)
    expect(readChatSendOnEnter('true')).toBe(true)
  })

  it('端末ストレージから設定を読み書きする', async () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => { values.set(key, value) },
    }

    expect(await loadChatSendOnEnter(storage)).toBe(false)
    await saveChatSendOnEnter(true, storage)
    expect(values.get(CHAT_SEND_ON_ENTER_STORAGE_KEY)).toBe('true')
    expect(await loadChatSendOnEnter(storage)).toBe(true)
  })

  it('端末ストレージの読み書き失敗を呼び出し側へ返す', async () => {
    const failure = new Error('storage unavailable')
    const storage = {
      getItem: async () => { throw failure },
      setItem: async () => { throw failure },
    }

    await expect(loadChatSendOnEnter(storage)).rejects.toBe(failure)
    await expect(saveChatSendOnEnter(true, storage)).rejects.toBe(failure)
  })

  it('Return送信がオンで編集中でなければ送信し、それ以外は改行する', () => {
    expect(chatInputSubmitBehavior(true, false)).toBe('submit')
    expect(chatInputSubmitBehavior(false, false)).toBe('newline')
    expect(chatInputSubmitBehavior(true, true)).toBe('newline')
  })
})
