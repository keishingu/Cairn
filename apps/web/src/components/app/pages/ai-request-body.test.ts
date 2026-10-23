// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import type { UIMessage } from 'ai'
import { buildAiRequestBody } from './ai-request-body'

describe('AI会話リクエスト本文', () => {
  test('最新の利用者メッセージだけを送り、大きなtool結果を再送しない', () => {
    const messages = [
      { id: 'user-1', role: 'user', content: '最初の質問' },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '調査結果',
        toolInvocations: [{
          state: 'result',
          toolCallId: 'tool-1',
          toolName: 'search_channel_messages',
          args: {},
          result: { content: 'x'.repeat(200_000) },
        }],
      },
      { id: 'user-2', role: 'user', content: '続きも教えて' },
    ] as UIMessage[]

    expect(buildAiRequestBody(messages)).toEqual({
      messages: [{ role: 'user', content: '続きも教えて' }],
    })
  })
})
