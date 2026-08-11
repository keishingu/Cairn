// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { hasReadMessage, partitionRecipientsByReadState } from './suppress'

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

describe('partitionRecipientsByReadState', () => {
  test('通知作成より先に対象メッセージを既読にした受信者を既読側へ分ける', () => {
    const message = { id: 'msg-1', createdAt: new Date('2026-06-12T00:00:10Z') }
    const recipients = [
      { userId: 'read-user', displayName: '既読' },
      { userId: 'unread-user', displayName: '未読' },
      { userId: 'no-state-user', displayName: '状態なし' },
    ]
    const states = new Map([
      ['read-user', { lastReadAt: null, lastReadMessageId: 'msg-1' }],
      ['unread-user', { lastReadAt: new Date('2026-06-12T00:00:09Z'), lastReadMessageId: null }],
      ['no-state-user', { lastReadAt: new Date('2026-06-12T00:00:09.999Z'), lastReadMessageId: null }],
    ])

    expect(partitionRecipientsByReadState(recipients, states, message)).toEqual({
      readRecipients: [recipients[0]],
      unreadRecipients: [recipients[1], recipients[2]],
    })
  })
})
