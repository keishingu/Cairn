// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { mockGetUnreadNotificationCount, mockSendNotification, mockSetVapidDetails, mockWhere } =
  vi.hoisted(() => ({
    mockGetUnreadNotificationCount: vi.fn(),
    mockSendNotification: vi.fn(),
    mockSetVapidDetails: vi.fn(),
    mockWhere: vi.fn(),
  }))

vi.mock('web-push', () => ({
  default: {
    sendNotification: mockSendNotification,
    setVapidDetails: mockSetVapidDetails,
  },
}))

vi.mock('expo-server-sdk', () => ({
  Expo: class {
    chunkPushNotifications() {
      return []
    }

    sendPushNotificationsAsync() {
      return Promise.resolve([])
    }
  },
}))

vi.mock('@cairn/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: mockWhere }),
    }),
  },
  pushSubscriptions: {
    id: 'push_subscriptions.id',
    userId: 'push_subscriptions.user_id',
    deviceType: 'push_subscriptions.device_type',
    endpoint: 'push_subscriptions.endpoint',
    keys: 'push_subscriptions.keys',
    expoToken: 'push_subscriptions.expo_token',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'condition'),
}))

vi.mock('@/lib/notifications/badge', () => ({
  getUnreadNotificationCount: mockGetUnreadNotificationCount,
}))

describe('sendPushToUser', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VAPID_PUBLIC_KEY', 'public-key')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key')
    mockWhere.mockResolvedValue([
      {
        id: 'subscription-1',
        deviceType: 'web',
        endpoint: 'https://push.example.test/subscription-1',
        keys: { p256dh: 'p256dh', auth: 'auth' },
        expoToken: null,
      },
    ])
    mockGetUnreadNotificationCount.mockResolvedValue(3)
    mockSendNotification.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  test('通常のPushは未読数でアプリアイコンバッジを更新する', async () => {
    const { sendPushToUser } = await import('./send')

    await sendPushToUser('user-1', { title: 'タイトル', body: '本文' })

    expect(mockGetUnreadNotificationCount).toHaveBeenCalledWith('user-1')
    expect(JSON.parse(mockSendNotification.mock.calls[0]![1] as string)).toMatchObject({
      title: 'タイトル',
      body: '本文',
      badgeCount: 3,
    })
  })

  test('バッジ更新なしのPushは通知だけを送り未読数を取得しない', async () => {
    const { sendPushToUser } = await import('./send')

    await sendPushToUser('user-1', { title: 'メンション', body: '本文' }, { updateAppBadge: false })

    expect(mockGetUnreadNotificationCount).not.toHaveBeenCalled()
    expect(JSON.parse(mockSendNotification.mock.calls[0]![1] as string)).toEqual({
      title: 'メンション',
      body: '本文',
    })
  })
})
