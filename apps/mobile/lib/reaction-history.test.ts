import { describe, expect, it } from 'vitest'
import {
  createReactionHistoryStore,
  createReactionHistoryQueue,
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

describe('リアクションの選択順', () => {
  it('後の通信が先に完了しても履歴は選択順に保存する', async () => {
    const queue = createReactionHistoryQueue()
    let finishFirst!: (result: { added: boolean }) => void
    const first = new Promise<{ added: boolean }>((resolve) => {
      finishFirst = resolve
    })
    const recent: string[] = []
    const record = async (emoji: string) => {
      recent.unshift(emoji)
    }
    const a = queue(first, () => record('🙏'))
    const b = queue(Promise.resolve({ added: true }), () => record('😭'))
    await Promise.resolve()
    expect(recent).toEqual([])
    finishFirst({ added: true })
    await Promise.all([a, b])
    expect(recent).toEqual(['😭', '🙏'])
  })

  it('先の通信が失敗しても後の追加を保存し、取り消しは保存しない', async () => {
    const queue = createReactionHistoryQueue()
    const recent: string[] = []
    const a = queue(Promise.reject(new Error('network')), async () => {
      recent.push('🙏')
    })
    const b = queue(Promise.resolve({ added: false }), async () => {
      recent.push('😭')
    })
    const c = queue(Promise.resolve({ added: true }), async () => {
      recent.push('🤔')
    })
    await expect(a).rejects.toThrow('network')
    await Promise.all([b, c])
    expect(recent).toEqual(['🤔'])
  })
})
