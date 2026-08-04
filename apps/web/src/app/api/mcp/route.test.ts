// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'

vi.mock('@cairn/db', () => ({ db: {} }))

describe('MCP Route Handler', () => {
  it('Bearer PATがないリクエストを401で拒否する', async () => {
    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
      }),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Bearer API token required' })
  }, 15_000)
})
