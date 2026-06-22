// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { hasReadMessage } from './suppress'

describe('hasReadMessage', () => {
  const message = { id: 'msg-1', createdAt: new Date('2026-06-12T00:00:10Z') }

  test('read state が存在しなければ未読扱い', () => {
    expect(hasReadMessage(undefined, message)).toBe(false)
  })

  test('last_read_message_id が対象メッセージと一致すれば既読', () => {
    expect(
      hasReadMessage({ lastReadAt: null, lastReadMessageId: 'msg-1' }, message),
    ).toBe(true)
  })

  test('last_read_at がメッセージ作成時刻以降なら既読', () => {
    expect(
      hasReadMessage(
        { lastReadAt: new Date('2026-06-12T00:00:11Z'), lastReadMessageId: null },
        message,
      ),
    ).toBe(true)
  })

  test('last_read_at がメッセージ作成時刻と同時刻でも既読', () => {
    expect(
      hasReadMessage(
        { lastReadAt: new Date('2026-06-12T00:00:10Z'), lastReadMessageId: null },
        message,
      ),
    ).toBe(true)
  })

  test('last_read_at がメッセージ作成時刻より前なら未読', () => {
    expect(
      hasReadMessage(
        { lastReadAt: new Date('2026-06-12T00:00:09Z'), lastReadMessageId: 'older-msg' },
        message,
      ),
    ).toBe(false)
  })

  test('last_read_at が null かつ message id 不一致なら未読', () => {
    expect(
      hasReadMessage({ lastReadAt: null, lastReadMessageId: 'older-msg' }, message),
    ).toBe(false)
  })
})
