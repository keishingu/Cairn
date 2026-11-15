// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { normalizeWebPushEndpoint } from './endpoint'

describe('Web Push endpointの検証', () => {
  test.each([
    'https://fcm.googleapis.com/fcm/send/token',
    'https://updates.push.services.mozilla.com/wpush/v2/token',
    'https://web.push.apple.com/Q/token',
    'https://abc.push.apple.com/Q/token',
    'https://db5p.notify.windows.com/w/?token=abc',
  ])('対応するPushサービスを許可する: %s', (endpoint) => {
    expect(normalizeWebPushEndpoint(endpoint)).not.toBeNull()
  })

  test.each([
    'https://127.0.0.1:9443/local-test',
    'http://fcm.googleapis.com/token',
    'https://fcm.googleapis.com:8443/token',
    'https://user@fcm.googleapis.com/token',
    'https://fcm.googleapis.com.evil.test/token',
    'https://evilpush.apple.com/token',
    'https://push.apple.com/token',
    'https://notify.windows.com.evil.test/token',
    'https://fcm.googleapis.com@127.0.0.1/token',
    'not a url',
  ])('許可対象外の送信先を拒否する: %s', (endpoint) => {
    expect(normalizeWebPushEndpoint(endpoint)).toBeNull()
  })
})
