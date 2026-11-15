// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// @vitest-environment node
import { createECDH, randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import https from 'node:https'
import type { IncomingMessage } from 'node:http'
import webpush from 'web-push'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { mockWhere } = vi.hoisted(() => ({ mockWhere: vi.fn() }))

vi.mock('@cairn/db', () => ({
  db: { select: () => ({ from: () => ({ where: mockWhere }) }) },
  pushSubscriptions: {
    id: 'id', userId: 'user_id', deviceType: 'device_type', endpoint: 'endpoint', keys: 'keys', expoToken: 'expo_token',
  },
}))
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }))

describe('Web Pushの実際の送信先', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  test('保存済みのエンコードされたホストを正規化してHTTPSリクエストに渡す', async () => {
    const vapid = webpush.generateVAPIDKeys()
    vi.stubEnv('VAPID_PUBLIC_KEY', vapid.publicKey)
    vi.stubEnv('VAPID_PRIVATE_KEY', vapid.privateKey)
    const subscriptionKey = createECDH('prime256v1')
    subscriptionKey.generateKeys()
    mockWhere.mockResolvedValue([{
      id: 'subscription-1', deviceType: 'web', endpoint: 'https://fcm%2egoogleapis.com/subscription-1',
      keys: { p256dh: subscriptionKey.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
      expoToken: null,
    }])

    const request = vi.spyOn(https, 'request').mockImplementation(((options: unknown, callback?: (response: IncomingMessage) => void) => {
      const req = new EventEmitter() as EventEmitter & { write: () => void; end: () => void }
      req.write = () => {}
      req.end = () => {
        const response = Object.assign(new EventEmitter(), { statusCode: 201, headers: {} })
        callback?.(response as IncomingMessage)
        response.emit('end')
      }
      return req
    }) as unknown as typeof https.request)

    vi.resetModules()
    const { sendPushToUser } = await import('./send')
    await sendPushToUser('user-1', { title: 'タイトル', body: '本文' }, { updateAppBadge: false })

    expect(request).toHaveBeenCalledOnce()
    expect(request.mock.calls[0]![0]).toMatchObject({ hostname: 'fcm.googleapis.com', path: '/subscription-1' })
  })
})
