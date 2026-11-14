// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePushNotifications } from './client'

const { fetchWithAuthMock } = vi.hoisted(() => ({ fetchWithAuthMock: vi.fn() }))

vi.mock('@/lib/fetch-with-auth', () => ({ fetchWithAuth: fetchWithAuthMock }))

const originalNotification = Object.getOwnPropertyDescriptor(window, 'Notification')
const originalPushManager = Object.getOwnPropertyDescriptor(window, 'PushManager')
const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')

function setPushEnvironment() {
  const notification = {
    permission: 'default',
    requestPermission: vi.fn(async () => {
      notification.permission = 'granted'
      return 'granted'
    }),
  }
  Object.defineProperty(window, 'Notification', { configurable: true, value: notification })
  Object.defineProperty(window, 'PushManager', { configurable: true, value: class PushManager {} })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue({
            endpoint: 'https://push.example/subscription',
            toJSON: () => ({ endpoint: 'https://push.example/subscription', keys: {} }),
          }),
        },
      }),
    },
  })
  fetchWithAuthMock.mockResolvedValue({
    ok: true,
    json: async () => ({ publicKey: 'AQAB' }),
  })
  return notification
}

afterEach(() => {
  fetchWithAuthMock.mockReset()
  if (originalNotification) Object.defineProperty(window, 'Notification', originalNotification)
  else delete (window as { Notification?: unknown }).Notification
  if (originalPushManager) Object.defineProperty(window, 'PushManager', originalPushManager)
  else delete (window as { PushManager?: unknown }).PushManager
  if (originalServiceWorker) Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker)
  else delete (navigator as { serviceWorker?: unknown }).serviceWorker
})

describe('Push通知の権限状態', () => {
  it('ベルで許可すると通知サイドバー側のトグル状態もONになる', async () => {
    const notification = setPushEnvironment()
    const bell = renderHook(() => usePushNotifications())
    const sidebar = renderHook(() => usePushNotifications())

    await waitFor(() => expect(bell.result.current.permission).toBe('default'))
    await act(async () => { await bell.result.current.subscribe() })

    await waitFor(() => expect(sidebar.result.current.permission).toBe('granted'))
    expect(notification.requestPermission).toHaveBeenCalledOnce()
  })
})
