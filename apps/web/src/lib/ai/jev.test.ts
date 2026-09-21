// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluateWithJev, resolveAiGatewayToken } from './jev'

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env['AI_GATEWAY_API_KEY']
  delete process.env['VERCEL_OIDC_TOKEN']
})

describe('Jev評価クライアント', () => {
  it('ローカル用キーをVercel OIDCより優先する', () => {
    expect(
      resolveAiGatewayToken({
        AI_GATEWAY_API_KEY: 'gateway-key',
        VERCEL_OIDC_TOKEN: 'oidc-token',
      }),
    ).toBe('gateway-key')
  })

  it('認証情報がなければ外部APIを呼ばない', () => {
    expect(() => resolveAiGatewayToken({})).toThrow(
      'AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN is not configured',
    )
  })

  it('JevへZDR付き評価を送り回答と利用量を返す', async () => {
    process.env['AI_GATEWAY_API_KEY'] = 'test-key'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'typesafe-ai/jev',
          answers: {
            candidate: {
              type: 'choice',
              choice: 'unanswered_ask',
              probabilities: { ignore: 0.01, unanswered_ask: 0.98, llm_risk: 0.01 },
            },
          },
          usage: { inputTokens: 321, outputTokens: 0 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await evaluateWithJev({
      state: { messages: [] },
      questions: {
        candidate: {
          type: 'choice',
          instructions: '分類してください',
          criteria: { ignore: '対象外', unanswered_ask: '未回答依頼' },
        },
      },
    })

    expect(result.usage).toEqual({ inputTokens: 321, outputTokens: 0 })
    expect(result.answers['candidate']).toMatchObject({
      type: 'choice',
      choice: 'unanswered_ask',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ai-gateway.vercel.sh/v1/evaluate',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
        body: expect.stringContaining('"zeroDataRetention":true'),
      }),
    )
  })

  it('Gatewayエラーの本文や認証情報を例外へ含めない', async () => {
    process.env['AI_GATEWAY_API_KEY'] = 'secret-key'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('provider detail', { status: 503 })),
    )

    await expect(
      evaluateWithJev({
        state: 'test',
        questions: { ok: { type: 'boolean', instructions: '成功したか' } },
      }),
    ).rejects.toThrow('Jev evaluation failed with status 503')
  })
})
