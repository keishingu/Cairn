import { describe, expect, test } from 'vitest'
import { loadPushEnabled, pushEnabledStorageKey, readPushEnabled, savePushEnabled } from './push-preference'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

describe('readPushEnabled', () => {
  test('未設定はオンとして扱う', () => {
    expect(readPushEnabled(null)).toBe(true)
  })

  test('オフにした記録だけをオフとして扱う', () => {
    expect(readPushEnabled('false')).toBe(false)
    expect(readPushEnabled('true')).toBe(true)
  })
})

describe('push の端末内設定', () => {
  test('ユーザーごとに保存し、別ユーザーの設定には影響しない', async () => {
    const storage = memoryStorage()
    await savePushEnabled('user-1', false, storage)

    expect(storage.values.get(pushEnabledStorageKey('user-1'))).toBe('false')
    await expect(loadPushEnabled('user-1', storage)).resolves.toBe(false)
    await expect(loadPushEnabled('user-2', storage)).resolves.toBe(true)
  })

  test('オンに戻した設定を読み出せる', async () => {
    const storage = memoryStorage()
    await savePushEnabled('user-1', false, storage)
    await savePushEnabled('user-1', true, storage)

    await expect(loadPushEnabled('user-1', storage)).resolves.toBe(true)
  })
})
