// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { MAX_REQUEST_BODY_BYTES, buildModelMessages, normalizeStoredConversationMessages, parseLatestUserInput } from './message-input'

describe('parseLatestUserInput', () => {
  it('最後の user メッセージだけを受け取る', () => {
    expect(parseLatestUserInput({
      messages: [
        { role: 'assistant', content: 'こんにちは' },
        { role: 'user', content: '  次の予定を教えて  ' },
      ],
    })).toEqual({
      lastUserContent: '次の予定を教えて',
      clientMessageCount: 2,
    })
  })

  it('最後が user 以外なら弾く', () => {
    expect(() => parseLatestUserInput({
      messages: [
        { role: 'user', content: '質問' },
        { role: 'assistant', content: '回答' },
      ],
    })).toThrow('最後のメッセージは user である必要があります')
  })

  it('文字列以外の content は弾く', () => {
    expect(() => parseLatestUserInput({
      messages: [
        { role: 'user', content: [{ type: 'text', text: '質問' }] },
      ],
    })).toThrow('messages は user/assistant の文字列メッセージを 1〜50 件で指定してください')
  })

  it('途中に tool ロールが混ざる payload は弾く', () => {
    expect(() => parseLatestUserInput({
      messages: [
        { role: 'tool', content: '検索結果' },
        { role: 'user', content: '最新の質問' },
      ],
    })).toThrow('messages は user/assistant の文字列メッセージを 1〜50 件で指定してください')
  })

  it('途中の assistant が 4000 文字超でも最後の user だけを受け取る', () => {
    expect(parseLatestUserInput({
      messages: [
        { role: 'assistant', content: 'a'.repeat(5000) },
        { role: 'user', content: '最新の質問' },
      ],
    })).toEqual({
      lastUserContent: '最新の質問',
      clientMessageCount: 2,
    })
  })

  it('50 件を超える client 履歴でも最後の user だけを受け取る', () => {
    const messages = Array.from({ length: 60 }, (_, index) => ({
      role: index % 2 === 0 ? 'assistant' : 'user',
      content: `message-${index}`,
    }))
    messages.push({ role: 'user', content: '最後の質問' })

    expect(() => parseLatestUserInput({ messages })).toThrow(
      'messages は user/assistant の文字列メッセージを 1〜50 件で指定してください',
    )
  })

  it('リクエスト本文サイズ上限を公開する', () => {
    expect(MAX_REQUEST_BODY_BYTES).toBe(64 * 1024)
  })
})

describe('buildModelMessages', () => {
  it('DB に保存済みの user / assistant 履歴だけでモデル入力を組み直す', () => {
    expect(buildModelMessages([
      { role: 'system', content: 'ignore' },
      { role: 'user', content: '前の質問' },
      { role: 'assistant', content: '前の回答' },
    ], '今回の質問')).toEqual([
      { role: 'user', content: '前の質問' },
      { role: 'assistant', content: '前の回答' },
      { role: 'user', content: '今回の質問' },
    ])
  })

  it('複数ターンでも DB の時系列を保ったままモデル入力を組み直す', () => {
    const createdAt1 = new Date('2026-06-29T07:58:19.000Z')
    const createdAt2 = new Date('2026-06-29T07:59:19.000Z')

    expect(buildModelMessages([
      { id: 'a1', role: 'assistant', content: '1つ目の回答', createdAt: createdAt1 },
      { id: 'u1', role: 'user', content: '1つ目の質問', createdAt: createdAt1 },
      { id: 'a2', role: 'assistant', content: '2つ目の回答', createdAt: createdAt2 },
      { id: 'u2', role: 'user', content: '2つ目の質問', createdAt: createdAt2 },
    ], '今回の質問')).toEqual([
      { role: 'user', content: '1つ目の質問' },
      { role: 'assistant', content: '1つ目の回答' },
      { role: 'user', content: '2つ目の質問' },
      { role: 'assistant', content: '2つ目の回答' },
      { role: 'user', content: '今回の質問' },
    ])
  })

  it('履歴が多くても直近 40 件だけをモデルに渡す', () => {
    const history = Array.from({ length: 50 }, (_, index) => ({
      id: `message-${index}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `message-${index}`,
      createdAt: new Date(`2026-06-29T00:${String(index).padStart(2, '0')}:00.000Z`),
    }))

    const messages = buildModelMessages(history, '今回の質問')

    expect(messages).toHaveLength(41)
    expect(messages[0]).toEqual({ role: 'user', content: 'message-10' })
    expect(messages.at(-1)).toEqual({ role: 'user', content: '今回の質問' })
  })
})

describe('normalizeStoredConversationMessages', () => {
  it('同じ createdAt の user / assistant は user を先にそろえる', () => {
    const createdAt = new Date('2026-06-29T07:58:19.000Z')

    expect(normalizeStoredConversationMessages([
      { id: 'b', role: 'assistant', content: '回答', createdAt },
      { id: 'a', role: 'user', content: '質問', createdAt },
    ])).toEqual([
      { id: 'a', role: 'user', content: '質問', createdAt },
      { id: 'b', role: 'assistant', content: '回答', createdAt },
    ])
  })

  it('createdAt が無い履歴でも user を先にそろえる', () => {
    expect(normalizeStoredConversationMessages([
      { id: 'b', role: 'assistant', content: '回答' },
      { id: 'a', role: 'user', content: '質問' },
    ])).toEqual([
      { id: 'a', role: 'user', content: '質問' },
      { id: 'b', role: 'assistant', content: '回答' },
    ])
  })
})
