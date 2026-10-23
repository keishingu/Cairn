import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  platformOS: 'android',
  calls: [] as string[],
  setNotificationChannelAsync: vi.fn(async () => {
    mocks.calls.push('channel')
  }),
  getExpoPushTokenAsync: vi.fn(async () => {
    mocks.calls.push('token')
    return { data: 'ExponentPushToken[x]' }
  }),
  apiFetch: vi.fn(async (_path: string, _init?: { method?: string; signal?: AbortSignal }, _session?: unknown) => ({ ok: true, status: 200 })),
  sessionUserId: 'user-1' as string | null,
  channelImportance: 3 as number | null,
  getNotificationChannelAsync: vi.fn(async () => (mocks.channelImportance === null ? null : { importance: mocks.channelImportance })),
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mocks.platformOS
    },
  },
}))
vi.mock('expo-notifications', () => ({
  setNotificationChannelAsync: mocks.setNotificationChannelAsync,
  getExpoPushTokenAsync: mocks.getExpoPushTokenAsync,
  getNotificationChannelAsync: mocks.getNotificationChannelAsync,
  AndroidImportance: { NONE: 0, DEFAULT: 3 },
}))
vi.mock('expo-constants', () => ({ default: { appOwnership: null, easConfig: { projectId: 'project-1' } } }))
vi.mock('./api-fetch', () => ({ apiFetch: mocks.apiFetch }))
vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: mocks.sessionUserId ? { user: { id: mocks.sessionUserId } } : null },
      }),
    },
  },
}))

import { ANDROID_NOTIFICATION_CHANNEL_ID, ensureAndroidNotificationChannel, isAndroidNotificationChannelDisabled, registerPushToken, unregisterPushToken } from './push-registration'

describe('Android の通知チャンネル', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.calls = []
    mocks.platformOS = 'android'
  })

  test('Android では、サーバーが送る宛先と同じ default チャンネルを作る', async () => {
    await ensureAndroidNotificationChannel()
    expect(mocks.setNotificationChannelAsync).toHaveBeenCalledWith(ANDROID_NOTIFICATION_CHANNEL_ID, { name: 'Cairn', importance: 3 })
    expect(ANDROID_NOTIFICATION_CHANNEL_ID).toBe('default')
  })

  test('iOS ではチャンネルを作らない', async () => {
    mocks.platformOS = 'ios'
    await ensureAndroidNotificationChannel()
    expect(mocks.setNotificationChannelAsync).not.toHaveBeenCalled()
  })

  test('トークンを取得する前にチャンネルを作る（Android 13+ はチャンネルが無いと通知を許可できないため）', async () => {
    await registerPushToken('user-1', async () => true)
    expect(mocks.calls).toEqual(['channel', 'token'])
  })

  test('利用者が default チャンネルをオフにしていれば、オフと判定する', async () => {
    mocks.channelImportance = 0
    await expect(isAndroidNotificationChannelDisabled()).resolves.toBe(true)
    mocks.channelImportance = 3
    await expect(isAndroidNotificationChannelDisabled()).resolves.toBe(false)
  })

  test('iOS にはチャンネルが無いので、オフと判定しない', async () => {
    mocks.platformOS = 'ios'
    await expect(isAndroidNotificationChannelDisabled()).resolves.toBe(false)
    expect(mocks.getNotificationChannelAsync).not.toHaveBeenCalled()
  })
})

describe('この端末の登録と解除', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.calls = []
    mocks.platformOS = 'ios'
    mocks.apiFetch.mockResolvedValue({ ok: true, status: 200 })
  })

  test('解除はこの端末のトークンを指定して外す', async () => {
    await unregisterPushToken('user-1')
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/push/subscribe', {
      method: 'DELETE',
      body: JSON.stringify({ deviceType: 'expo', expoToken: 'ExponentPushToken[x]' }),
      signal: expect.any(AbortSignal),
    }, { user: { id: 'user-1' } })
  })

  test('サーバーが失敗を返したら解除も失敗にする', async () => {
    mocks.apiFetch.mockResolvedValue({ ok: false, status: 500 })
    await expect(unregisterPushToken('user-1')).rejects.toThrow('500')
  })
})

describe('登録と解除の順序', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.platformOS = 'ios'
    mocks.apiFetch.mockResolvedValue({ ok: true, status: 200 })
  })

  test('登録の途中でオフにしても、解除は登録が終わってから送る', async () => {
    const methods: string[] = []
    let finishPost: () => void = () => undefined
    mocks.apiFetch.mockImplementation(async (_path, init) => {
      methods.push(`${init?.method}:start`)
      if (init?.method === 'POST') await new Promise<void>((resolve) => { finishPost = resolve })
      methods.push(`${init?.method}:end`)
      return { ok: true, status: 200 }
    })

    const register = registerPushToken('user-1', async () => true)
    const unregister = unregisterPushToken('user-1')
    await vi.waitFor(() => expect(methods).toEqual(['POST:start']))
    finishPost()
    await Promise.all([register, unregister])

    expect(methods).toEqual(['POST:start', 'POST:end', 'DELETE:start', 'DELETE:end'])
  })

  test('順番待ちの間にオフにされた登録は送らない', async () => {
    let enabled = true
    let finishFirst: () => void = () => undefined
    mocks.apiFetch.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => { finishFirst = resolve })
      return { ok: true, status: 200 }
    })

    const first = unregisterPushToken('user-1')
    const pending = registerPushToken('user-1', async () => enabled)
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(1))
    enabled = false
    finishFirst()
    await Promise.all([first, pending])

    expect(mocks.apiFetch).toHaveBeenCalledTimes(1)
  })

  test('前の処理が失敗しても、後の処理は実行する', async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    const failed = unregisterPushToken('user-1')
    const next = registerPushToken('user-1', async () => true)

    await expect(failed).rejects.toThrow('500')
    await expect(next).resolves.toBeUndefined()
    expect(mocks.apiFetch).toHaveBeenLastCalledWith('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ deviceType: 'expo', expoToken: 'ExponentPushToken[x]' }),
      signal: expect.any(AbortSignal),
    }, { user: { id: 'user-1' } })
  })
})

describe('サーバーへの送信の時間切れ', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.platformOS = 'ios'
  })

  test('時間切れではリクエストを中断し、中断で決着してから次の処理へ進む', async () => {
    vi.useFakeTimers()
    try {
      const events: string[] = []
      mocks.apiFetch.mockImplementationOnce(
        (_path, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              events.push('POST:aborted')
              reject(new Error('aborted'))
            })
          }),
      )
      mocks.apiFetch.mockImplementationOnce(async (_path, init) => {
        events.push(`${init?.method}:sent`)
        return { ok: true, status: 200 }
      })

      const register = registerPushToken('user-1', async () => true)
      const registerResult = expect(register).rejects.toThrow('Timed out updating push subscription')
      const unregister = unregisterPushToken('user-1')
      await vi.advanceTimersByTimeAsync(20_000)
      await registerResult
      await unregister

      expect(events).toEqual(['POST:aborted', 'DELETE:sent'])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('アカウントの切り替え', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.platformOS = 'ios'
    mocks.sessionUserId = 'user-1'
    mocks.apiFetch.mockResolvedValue({ ok: true, status: 200 })
  })

  test('トークン取得を待つ間に別アカウントへ切り替わったら、登録も解除も送らない', async () => {
    mocks.getExpoPushTokenAsync.mockImplementationOnce(async () => {
      mocks.sessionUserId = 'user-2'
      return { data: 'ExponentPushToken[x]' }
    })
    await expect(registerPushToken('user-1', async () => true)).rejects.toThrow('Signed-in account changed')

    await expect(unregisterPushToken('user-1')).rejects.toThrow('Signed-in account changed')
    expect(mocks.apiFetch).not.toHaveBeenCalled()
  })

  test('始めたユーザーのセッションを指定して送る', async () => {
    await registerPushToken('user-1', async () => true)

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      '/api/push/subscribe',
      expect.objectContaining({ method: 'POST' }),
      { user: { id: 'user-1' } },
    )
  })
})
