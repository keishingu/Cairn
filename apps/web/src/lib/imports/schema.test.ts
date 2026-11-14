// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { completeImportJobSchema, createImportJobSchema, importBatchSchema } from './schema'

const message = {
  externalId: '1760000000000',
  identityKey: 'anonymous',
  sentAt: '2025-10-09T15:13:20.000Z',
  editedAt: null,
  text: '本文 \\<\u2060@x\\> <https://example.com/a>',
  quotedExternalId: null,
  reactions: [],
  mediaObjectIds: [],
  attributes: { messageType: 'RichText/Html', senderIdPresent: false, senderNamePresent: false, hasSubject: false, isEventCard: false, mentionCount: 0 },
}

describe('importBatchSchema', () => {
  test('Parser の出力の形を受け付ける', () => {
    expect(importBatchSchema.safeParse({ conversationExternalId: '19:a@thread.v2', messages: [message] }).success).toBe(true)
  })

  test('本文に HTML のタグが含まれていたら拒否する', () => {
    const result = importBatchSchema.safeParse({ conversationExternalId: '19:a@thread.v2', messages: [{ ...message, text: '<img src=x onerror=alert(1)>' }] })
    expect(result.success).toBe(false)
  })

  test('本文に Cairn のメンション記法が含まれていたら拒否する', () => {
    const result = importBatchSchema.safeParse({ conversationExternalId: '19:a@thread.v2', messages: [{ ...message, text: '\\<@00000000-0000-0000-0000-000000000001>' }] })
    expect(result.success).toBe(false)
  })

  test('メッセージ ID・メディア ID の形式が不正なら拒否する', () => {
    expect(importBatchSchema.safeParse({ conversationExternalId: '19:a@thread.v2', messages: [{ ...message, externalId: '../x' }] }).success).toBe(false)
    expect(importBatchSchema.safeParse({ conversationExternalId: '19:a@thread.v2', messages: [{ ...message, mediaObjectIds: ['../../etc'] }] }).success).toBe(false)
  })

  test('1バッチは200件まで', () => {
    const messages = Array.from({ length: 201 }, (_, i) => ({ ...message, externalId: String(1760000000000 + i) }))
    expect(importBatchSchema.safeParse({ conversationExternalId: '19:a@thread.v2', messages }).success).toBe(false)
  })
})

describe('createImportJobSchema', () => {
  test('投稿者不明の指定と種類が食い違っていたら拒否する', () => {
    const base = { source: 'teams-consumer', exportedAt: null, conversations: [{ externalId: '19:a@thread.v2', channelId: '00000000-0000-4000-8000-000000000001', totalMessages: 1 }] }
    expect(createImportJobSchema.safeParse({ ...base, identities: [{ key: 'anonymous', displayName: null, anonymous: true, kind: 'anonymous' }] }).success).toBe(true)
    expect(createImportJobSchema.safeParse({ ...base, identities: [{ key: 'x', displayName: null, anonymous: true, kind: 'named' }] }).success).toBe(false)
  })
})

describe('createImportJobSchema: 会話の種類', () => {
  test.each([
    ['19:uni01_abc@thread.v2'],
    ['19:meeting_abc@thread.v2'],
    ['19:stream01_abc@thread.v2'],
  ])('グループ以外の会話（%s）は拒否する', (externalId) => {
    const result = createImportJobSchema.safeParse({
      source: 'teams-consumer', exportedAt: null, identities: [],
      conversations: [{ externalId, channelId: '00000000-0000-4000-8000-000000000001', totalMessages: 1 }],
    })
    expect(result.success).toBe(false)
  })
})

describe('completeImportJobSchema', () => {
  test('レポートに本文や氏名を入れる欄はなく、未知の項目は捨てる', () => {
    const parsed = completeImportJobSchema.parse({
      status: 'completed',
      report: { conversations: [{ externalId: '19:a@thread.v2', counts: { messages: 1 }, text: '本文' }], excludedConversations: {}, mediaFailures: [] },
    })
    expect(JSON.stringify(parsed)).not.toContain('本文')
  })
})
