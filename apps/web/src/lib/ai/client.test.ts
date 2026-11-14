// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiKeyEnvForChatModel, chatLanguageModel, nudgeCopyLanguageModel } from './client'

describe('AI モデルの解決', () => {
  afterEach(() => {
    delete process.env['ANTHROPIC_API_KEY']
  })

  it('選択したモデルのプロバイダーに必要な API キーの環境変数名を返す', () => {
    expect(apiKeyEnvForChatModel('gpt-5')).toBe('OPENAI_API_KEY')
    expect(apiKeyEnvForChatModel('claude-sonnet-5-5')).toBe('ANTHROPIC_API_KEY')
    expect(apiKeyEnvForChatModel('claude-opus-5-5')).toBe('ANTHROPIC_API_KEY')
  })

  it('チャットのモデルはモデル ID を日付サフィックスなしでそのまま渡す', () => {
    expect(chatLanguageModel('gpt-5').modelId).toBe('gpt-5')
    expect(chatLanguageModel('claude-sonnet-5-5').modelId).toBe('claude-sonnet-5-5')
    expect(chatLanguageModel('claude-opus-5-5').modelId).toBe('claude-opus-5-5')
  })

  it('通知文生成は ANTHROPIC_API_KEY が未設定ならエラーにして、他のプロバイダーへ逃がさない', () => {
    expect(() => nudgeCopyLanguageModel()).toThrow('ANTHROPIC_API_KEY が設定されていません')
  })

  it('通知文生成は Claude Haiku 5.5 を使う', () => {
    process.env['ANTHROPIC_API_KEY'] = 'test-key'

    expect(nudgeCopyLanguageModel().modelId).toBe('claude-haiku-5-5')
  })

  it('GPT-5 のストリーミングは使用量を受け取るため stream_options.include_usage を送る', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('data: [DONE]\n\n', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      await chatLanguageModel('gpt-5').doStream({
        inputFormat: 'messages',
        mode: { type: 'regular' },
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'こんにちは' }] }],
      })
    } finally {
      vi.unstubAllGlobals()
    }

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as Record<string, unknown>
    expect(body['stream']).toBe(true)
    expect(body['stream_options']).toEqual({ include_usage: true })
  })
})
