// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const {
  mockGetUnreadNotificationCount,
  mockSendNotification,
  mockSetVapidDetails,
  mockWhere,
  mockChunkPushNotifications,
  mockSendPushNotificationsAsync,
} = vi.hoisted(() => ({
  mockGetUnreadNotificationCount: vi.fn(),
  mockSendNotification: vi.fn(),
  mockSetVapidDetails: vi.fn(),
  mockWhere: vi.fn(),
  mockChunkPushNotifications: vi.fn((messages: unknown[]) => [messages]),
  mockSendPushNotificationsAsync: vi.fn((_chunk: unknown) => Promise.resolve([])),
}))

vi.mock('web-push', () => ({
  default: {
    sendNotification: mockSendNotification,
    setVapidDetails: mockSetVapidDetails,
  },
}))

vi.mock('expo-server-sdk', () => ({
  Expo: class {
    chunkPushNotifications(messages: unknown[]) {
      return mockChunkPushNotifications(messages)
    }

    sendPushNotificationsAsync(chunk: unknown) {
      return mockSendPushNotificationsAsync(chunk)
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

const webSubscription = {
  id: 'subscription-1',
  deviceType: 'web',
  endpoint: 'https://fcm.googleapis.com/subscription-1',
  keys: { p256dh: 'p256dh', auth: 'auth' },
  expoToken: null,
}

const expoSubscription = {
  id: 'expo-1',
  deviceType: 'expo',
  endpoint: null,
  keys: null,
  expoToken: 'ExpoPushToken[abc]',
}

function firstExpoMessage() {
  return (mockChunkPushNotifications.mock.calls[0]![0] as unknown[])[0]
}

describe('sendPushToUser', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VAPID_PUBLIC_KEY', 'public-key')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key')
    mockWhere.mockResolvedValue([webSubscription])
    mockGetUnreadNotificationCount.mockResolvedValue(3)
    mockSendNotification.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  test('保存済みの許可対象外の送信先には送らない', async () => {
    mockWhere.mockResolvedValue([
      { ...webSubscription, id: 'unsafe', endpoint: 'https://127.0.0.1:9443/local-test' },
      webSubscription,
    ])
    const { sendPushToUser } = await import('./send')

    await sendPushToUser('user-1', { title: 'タイトル', body: '本文' })

    expect(mockSendNotification).toHaveBeenCalledTimes(1)
    expect(mockSendNotification.mock.calls[0]![0]).toMatchObject({ endpoint: webSubscription.endpoint })
  })

  test('保存済みのURLを正規化して検証したホストへ送る', async () => {
    mockWhere.mockResolvedValue([{ ...webSubscription, endpoint: 'https://fcm%2egoogleapis.com/subscription-1' }])
    const { sendPushToUser } = await import('./send')

    await sendPushToUser('user-1', { title: 'タイトル', body: '本文' })

    expect(mockSendNotification).toHaveBeenCalledOnce()
    expect(mockSendNotification.mock.calls[0]![0]).toMatchObject({ endpoint: 'https://fcm.googleapis.com/subscription-1' })
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

  test.each(['ExpoPushToken[abc]', 'ExponentPushToken[abc]'])('Expo の新旧トークンで遷移先とワークスペースを送る: %s', async (expoToken) => {
    mockWhere.mockResolvedValue([
      {
        id: 'expo-1',
        deviceType: 'expo',
        endpoint: null,
        keys: null,
        expoToken,
      },
    ])
    const { sendPushToUser } = await import('./send')

    await sendPushToUser('user-1', {
      title: 'メンション',
      body: '本文',
      url: '/chats/ch-1',
      workspaceId: 'ws-1',
    })

    expect(mockChunkPushNotifications).toHaveBeenCalledWith([
      {
        to: expoToken,
        title: 'メンション',
        body: '本文',
        data: { url: '/chats/ch-1', workspaceId: 'ws-1' },
        badge: 3,
      },
    ])
    expect(mockSendNotification).not.toHaveBeenCalled()
  })

  test('VAPID が未設定でも Expo には未読数のバッジを送る', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '')
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    mockWhere.mockResolvedValue([expoSubscription])
    const { sendPushToUser } = await import('./send')

    await sendPushToUser('user-1', { title: 'タイトル', body: '本文' })

    expect(mockGetUnreadNotificationCount).toHaveBeenCalledWith('user-1')
    expect(firstExpoMessage()).toMatchObject({ badge: 3 })
  })

  test('未読が0件なら Expo のバッジを消すため 0 を送る', async () => {
    mockWhere.mockResolvedValue([expoSubscription])
    mockGetUnreadNotificationCount.mockResolvedValue(0)
    const { sendPushToUser } = await import('./send')

    await sendPushToUser('user-1', { title: 'タイトル', body: '本文' })

    expect(firstExpoMessage()).toMatchObject({ badge: 0 })
  })

  test('Web と Expo の両方の購読があっても未読数の集計は1回で同じ値を送る', async () => {
    mockWhere.mockResolvedValue([webSubscription, expoSubscription])
    const { sendPushToUser } = await import('./send')

    await sendPushToUser('user-1', { title: 'タイトル', body: '本文' })

    expect(mockGetUnreadNotificationCount).toHaveBeenCalledTimes(1)
    expect(JSON.parse(mockSendNotification.mock.calls[0]![1] as string)).toMatchObject({ badgeCount: 3 })
    expect(firstExpoMessage()).toMatchObject({ badge: 3 })
  })

  test('バッジ更新なしのPushは Expo でも badge を送らず未読数を取得しない', async () => {
    mockWhere.mockResolvedValue([expoSubscription])
    const { sendPushToUser } = await import('./send')

    await sendPushToUser('user-1', { title: 'タイトル', body: '本文' }, { updateAppBadge: false })

    expect(mockGetUnreadNotificationCount).not.toHaveBeenCalled()
    expect(firstExpoMessage()).not.toHaveProperty('badge')
  })

  test('未読数の集計に失敗しても Expo の通知は badge なしで送る', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockWhere.mockResolvedValue([expoSubscription])
    mockGetUnreadNotificationCount.mockRejectedValue(new Error('db down'))
    const { sendPushToUser } = await import('./send')

    await sendPushToUser('user-1', { title: 'タイトル', body: '本文' })

    expect(firstExpoMessage()).toEqual({
      to: 'ExpoPushToken[abc]',
      title: 'タイトル',
      body: '本文',
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
