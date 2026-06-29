// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { buildModelMessages, parseLatestUserInput } from './message-input'

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
    })).toThrow('最後のメッセージは user/assistant の文字列メッセージで指定してください')
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

    expect(parseLatestUserInput({ messages })).toEqual({
      lastUserContent: '最後の質問',
      clientMessageCount: 61,
    })
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
})
