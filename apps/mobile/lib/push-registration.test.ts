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
  apiFetch: vi.fn(async () => ({ ok: true, status: 200 })),
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
  AndroidImportance: { DEFAULT: 3 },
}))
vi.mock('expo-constants', () => ({ default: { appOwnership: null, easConfig: { projectId: 'project-1' } } }))
vi.mock('./api-fetch', () => ({ apiFetch: mocks.apiFetch }))

import { ANDROID_NOTIFICATION_CHANNEL_ID, ensureAndroidNotificationChannel, registerPushToken } from './push-registration'

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
    await registerPushToken()
    expect(mocks.calls).toEqual(['channel', 'token'])
  })
})
