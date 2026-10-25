import { describe, expect, test, vi } from 'vitest'
import {
  completePendingRemoval,
  loadPushEnabled,
  loadPushSetting,
  pushEnabledStorageKey,
  readPushSetting,
  savePushEnabled,
  subscribePushPreference,
} from './push-preference'

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

describe('readPushSetting', () => {
  test('未設定はオンとして扱う', () => {
    expect(readPushSetting(null)).toEqual({ enabled: true, removalPending: false })
  })

  test('オフにした記録はオフとして扱い、解除待ちかどうかを区別する', () => {
    expect(readPushSetting('false')).toEqual({ enabled: false, removalPending: false })
    expect(readPushSetting('off-pending')).toEqual({ enabled: false, removalPending: true })
    expect(readPushSetting('true')).toEqual({ enabled: true, removalPending: false })
  })
})

describe('push の端末内設定', () => {
  test('ユーザーごとに保存し、別ユーザーの設定には影響しない', async () => {
    const storage = memoryStorage()
    await savePushEnabled('user-1', false, storage)

    await expect(loadPushEnabled('user-1', storage)).resolves.toBe(false)
    await expect(loadPushEnabled('user-2', storage)).resolves.toBe(true)
  })

  test('オフは解除が終わるまで解除待ちとして保存する', async () => {
    const storage = memoryStorage()
    await savePushEnabled('user-1', false, storage)

    await expect(loadPushSetting('user-1', storage)).resolves.toEqual({ enabled: false, removalPending: true })
  })

  test('オンに戻した設定を読み出せる', async () => {
    const storage = memoryStorage()
    await savePushEnabled('user-1', false, storage)
    await savePushEnabled('user-1', true, storage)

    await expect(loadPushEnabled('user-1', storage)).resolves.toBe(true)
  })

  test('保存すると変更元と一緒に購読者へ知らせ、購読をやめた後は知らせない', async () => {
    const storage = memoryStorage()
    const listener = vi.fn()
    const unsubscribe = subscribePushPreference(listener)
    const source = {}

    await savePushEnabled('user-1', false, storage, source)
    expect(listener).toHaveBeenCalledWith('user-1', source)

    unsubscribe()
    await savePushEnabled('user-1', true, storage)
    expect(listener).toHaveBeenCalledOnce()
  })
})

describe('completePendingRemoval', () => {
  test('解除待ちなら解除を送り、終わったら単なるオフにする', async () => {
    const storage = memoryStorage()
    await savePushEnabled('user-1', false, storage)
    const unregister = vi.fn(async () => undefined)

    await completePendingRemoval('user-1', storage, unregister)

    expect(unregister).toHaveBeenCalledOnce()
    expect(storage.values.get(pushEnabledStorageKey('user-1'))).toBe('false')
  })

  test('解除に失敗したら解除待ちのまま残し、次の機会に送り直せる', async () => {
    const storage = memoryStorage()
    await savePushEnabled('user-1', false, storage)

    await expect(
      completePendingRemoval('user-1', storage, async () => {
        throw new Error('offline')
      }),
    ).rejects.toThrow('offline')
    await expect(loadPushSetting('user-1', storage)).resolves.toEqual({ enabled: false, removalPending: true })
  })

  test('解除待ちでなければ何も送らない', async () => {
    const storage = memoryStorage()
    const unregister = vi.fn(async () => undefined)

    await completePendingRemoval('user-1', storage, unregister)
    await savePushEnabled('user-1', true, storage)
    await completePendingRemoval('user-1', storage, unregister)

    expect(unregister).not.toHaveBeenCalled()
  })

  test('解除中にオンへ戻されたら、オンの記録を上書きしない', async () => {
    const storage = memoryStorage()
    await savePushEnabled('user-1', false, storage)

    await completePendingRemoval('user-1', storage, async () => {
      await savePushEnabled('user-1', true, storage)
    })

    await expect(loadPushEnabled('user-1', storage)).resolves.toBe(true)
  })
})
