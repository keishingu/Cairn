// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchWithAuth = vi.fn()
vi.mock('@/lib/fetch-with-auth', () => ({ fetchWithAuth: (...args: unknown[]) => fetchWithAuth(...args) }))

const { postCardAction } = await import('./card-actions')

const action = { type: 'button' as const, blockId: 'b', actionId: 'vote' }

describe('カードの操作の送信', () => {
  beforeEach(() => fetchWithAuth.mockReset())

  it('古い版として断られたら、取り直しを呼んでからエラーコードを投げる', async () => {
    fetchWithAuth.mockResolvedValue(new Response(JSON.stringify({ error: 'card_changed' }), { status: 409 }))
    const onStale = vi.fn()
    await expect(postCardAction('m', 'r1', action, 'ja', onStale)).rejects.toMatchObject({ code: 'card_changed' })
    expect(onStale).toHaveBeenCalledTimes(1)
  })

  it('ほかのエラーでは取り直しを呼ばない', async () => {
    fetchWithAuth.mockResolvedValue(new Response(JSON.stringify({ error: 'app_timeout' }), { status: 502 }))
    const onStale = vi.fn()
    await expect(postCardAction('m', 'r1', action, 'ja', onStale)).rejects.toMatchObject({ code: 'app_timeout' })
    expect(onStale).not.toHaveBeenCalled()
  })

  it('成功したら取り直しを呼ばない', async () => {
    fetchWithAuth.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const onStale = vi.fn()
    await postCardAction('m', 'r1', action, 'ja', onStale)
    expect(onStale).not.toHaveBeenCalled()
  })
})
