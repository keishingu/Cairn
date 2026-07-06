// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { buildAiChatRequestBody } from './ai-request'

describe('buildAiChatRequestBody', () => {
  it('最後のメッセージだけを API に送る', () => {
    expect(buildAiChatRequestBody([
      { id: 'a1', role: 'assistant', content: '前の回答' },
      { id: 'u1', role: 'user', content: '今回の質問' },
    ])).toEqual({
      messages: [{ id: 'u1', role: 'user', content: '今回の質問' }],
    })
  })

  it('メッセージが無ければ空配列を返す', () => {
    expect(buildAiChatRequestBody([])).toEqual({ messages: [] })
  })
})
