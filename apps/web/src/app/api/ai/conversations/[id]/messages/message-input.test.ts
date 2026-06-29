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
    })).toThrow('messages は user/assistant の文字列メッセージを 1〜50 件で指定してください')
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
