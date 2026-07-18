// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@cairn/db', () => ({ db: { execute: mockExecute } }))
vi.mock('drizzle-orm', () => ({ sql: (strings: TemplateStringsArray) => strings.join('') }))

function requestWithSecFetchSite(value: string | null): Request {
  const headers = new Headers()
  if (value !== null) headers.set('sec-fetch-site', value)
  return new Request('http://localhost/api/warmup', { headers })
}

describe('GET /api/warmup', () => {
  it('sec-fetch-siteがsame-origin以外なら403を返しDBを叩かない', async () => {
    const { GET } = await import('./route')
    const res = await GET(requestWithSecFetchSite('cross-site'))
    expect(res.status).toBe(403)
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('sec-fetch-siteヘッダがない場合も403を返す', async () => {
    const { GET } = await import('./route')
    const res = await GET(requestWithSecFetchSite(null))
    expect(res.status).toBe(403)
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('sec-fetch-siteがsame-originならDBにpingして200を返す', async () => {
    const { GET } = await import('./route')
    const res = await GET(requestWithSecFetchSite('same-origin'))
    expect(res.status).toBe(200)
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  it('DB pingが失敗してもbest-effortとして200を返す', async () => {
    mockExecute.mockRejectedValueOnce(new Error('connection failed'))
    const { GET } = await import('./route')
    const res = await GET(requestWithSecFetchSite('same-origin'))
    expect(res.status).toBe(200)
  })
})
