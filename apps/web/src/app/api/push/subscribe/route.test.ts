// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, test, vi } from 'vitest'

const { mockGetAuthContext, mockInsert, mockValues, mockConflictUpdate, mockConflictNothing } = vi.hoisted(() => {
  const mockConflictUpdate = vi.fn()
  const mockConflictNothing = vi.fn()
  const mockValues = vi.fn(() => ({
    onConflictDoUpdate: mockConflictUpdate,
    onConflictDoNothing: mockConflictNothing,
  }))
  return {
    mockGetAuthContext: vi.fn(),
    mockInsert: vi.fn(() => ({ values: mockValues })),
    mockValues,
    mockConflictUpdate,
    mockConflictNothing,
  }
})

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@cairn/db', () => ({
  db: { insert: mockInsert },
  pushSubscriptions: { userId: 'user_id', endpoint: 'endpoint' },
}))

import { POST } from './route'

function subscribe(body: unknown) {
  return POST(new Request('http://localhost/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

describe('Push購読の登録', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1' },
      error: null,
    })
  })

  test.each([
    'ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
  ])('Expoの新旧トークン形式を保存できる: %s', async (expoToken) => {
    const response = await subscribe({ deviceType: 'expo', expoToken })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mockValues).toHaveBeenCalledWith({ userId: 'user-1', deviceType: 'expo', expoToken })
    expect(mockConflictNothing).toHaveBeenCalledOnce()
    expect(mockConflictUpdate).not.toHaveBeenCalled()
  })

  test.each([
    'not-a-token',
    'ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx',
    'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx',
    'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]suffix',
    '',
    null,
    123,
  ])('不正なExpoトークンは保存せず422を返す: %s', async (expoToken) => {
    const response = await subscribe({ deviceType: 'expo', expoToken })

    expect(response.status).toBe(422)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  test('Web Pushの購読は従来どおり保存する', async () => {
    const body = {
      deviceType: 'web',
      endpoint: 'https://push.example.test/subscription-1',
      keys: { p256dh: 'public-key', auth: 'auth-key' },
    }
    const response = await subscribe(body)

    expect(response.status).toBe(200)
    expect(mockValues).toHaveBeenCalledWith({ userId: 'user-1', ...body })
    expect(mockConflictUpdate).toHaveBeenCalledWith({
      target: ['user_id', 'endpoint'],
      set: { keys: body.keys },
    })
    expect(mockConflictNothing).not.toHaveBeenCalled()
  })

  test('未認証の購読は保存しない', async () => {
    mockGetAuthContext.mockResolvedValue({ ctx: null, error: new Response(null, { status: 401 }) })

    const response = await subscribe({ deviceType: 'expo', expoToken: 'ExpoPushToken[abc]' })

    expect(response.status).toBe(401)
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
