import { describe, expect, it } from 'vitest'
import {
  createReactionHistoryStore,
  DEFAULT_REACTIONS,
  parseReactionHistory,
  quickReactions,
} from './reaction-history'

describe('リアクション履歴', () => {
  it('履歴を優先し、重複せず既定の絵文字で6件に補う', () => {
    expect(quickReactions([])).toEqual(DEFAULT_REACTIONS)
    expect(quickReactions(['🙏', '❤️', '🤔'])).toEqual(['🙏', '❤️', '🤔', '👍', '😂', '🎉'])
  })
  it('破損した履歴は空の履歴として隠さずエラーにする', () => {
    expect(parseReactionHistory(null)).toEqual([])
    expect(() => parseReactionHistory('{')).toThrow()
    expect(() => parseReactionHistory('[42]')).toThrow()
    expect(parseReactionHistory('["🙏","🙏"]')).toEqual(['🙏'])
  })
  it('連続した追加を失わず、再読み込みしてもユーザーごとに分離する', async () => {
    const values = new Map<string, string>()
    const storage = {
      async getItem(key: string) {
        return values.get(key) ?? null
      },
      async setItem(key: string, value: string) {
        values.set(key, value)
      },
    }
    const store = createReactionHistoryStore(storage)
    await Promise.all([
      store.record('a', '🙏'),
      store.record('a', '😭'),
      store.record('a', '🙏'),
      store.record('b', '🤔'),
    ])
    const reloaded = createReactionHistoryStore(storage)
    expect(await reloaded.read('a')).toEqual(['🙏', '😭'])
    expect(await reloaded.read('b')).toEqual(['🤔'])
  })
  it('保存失敗を伝え、その後の保存を妨げない', async () => {
    let fail = true
    const store = createReactionHistoryStore({
      async getItem() {
        return null
      },
      async setItem() {
        if (fail) throw new Error('disk')
      },
    })
    await expect(store.record('a', '🙏')).rejects.toThrow('disk')
    fail = false
    await expect(store.record('a', '🤔')).resolves.toEqual(['🤔'])
  })
  it('直近32件まで保存する', async () => {
    let value: string | null = null
    const store = createReactionHistoryStore({
      async getItem() {
        return value
      },
      async setItem(_, next) {
        value = next
      },
    })
    for (let i = 0; i < 40; i++) await store.record('a', `emoji-${i}`)
    const history = await store.read('a')
    expect(history).toHaveLength(32)
    expect(history[0]).toBe('emoji-39')
    expect(history[31]).toBe('emoji-8')
  })
})
