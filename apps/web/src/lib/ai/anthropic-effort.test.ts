// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { createEffortFetch, withSonnetEffort } from './anthropic-effort'

const parse = (v: unknown) => JSON.parse(v as string) as Record<string, unknown>

describe('Sonnet 5.5 の effort 付与', () => {
  it('Sonnet 5.5 のリクエストには output_config.effort = medium を付ける', () => {
    const out = parse(withSonnetEffort(JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 10 })))
    expect(out['output_config']).toEqual({ effort: 'medium' })
    expect(out['max_tokens']).toBe(10)
  })

  it('既存の output_config のキーは残す', () => {
    const out = parse(
      withSonnetEffort(
        JSON.stringify({ model: 'claude-sonnet-5-5', output_config: { format: { type: 'json' } } }),
      ),
    )
    expect(out['output_config']).toEqual({ format: { type: 'json' }, effort: 'medium' })
  })

  it('明示された effort は上書きしない', () => {
    const body = JSON.stringify({ model: 'claude-sonnet-5-5', output_config: { effort: 'high' } })
    expect(withSonnetEffort(body)).toBe(body)
  })

  it('Opus・Haiku・未知のモデルの本文は変えない', () => {
    for (const model of ['claude-opus-5-5', 'claude-haiku-5-5', 'gpt-5']) {
      const body = JSON.stringify({ model })
      expect(withSonnetEffort(body)).toBe(body)
    }
  })

  it('JSON でない本文や文字列以外の本文は変えない', () => {
    expect(withSonnetEffort('not json')).toBe('not json')
    expect(withSonnetEffort('[1]')).toBe('[1]')
    expect(withSonnetEffort(undefined)).toBeUndefined()
  })

  it('POST 以外のリクエストは本文・引数をそのまま渡す', async () => {
    let seen: RequestInit | undefined
    const f = createEffortFetch((async (_u: unknown, init?: RequestInit) => {
      seen = init
      return new Response('ok')
    }) as unknown as typeof fetch)
    const init = { method: 'GET' }
    await f('https://example.com', init)
    expect(seen).toBe(init)
  })
})
