// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'

const { mockVerifyApiToken } = vi.hoisted(() => ({
  mockVerifyApiToken: vi.fn(),
}))

vi.mock('@cairn/db', () => ({ db: {} }))
vi.mock('@/lib/api-tokens', () => ({
  ApiTokenError: class ApiTokenError extends Error {
    status: number

    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
  runWithApiTokenAccess: (callback: () => unknown) => callback(),
  verifyApiToken: mockVerifyApiToken,
}))

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

  it('ファイル一覧と抽出済み本文の読み取りツールを公開する', async () => {
    mockVerifyApiToken.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      workspaceId: 'workspace-1',
      scope: 'read',
      expiresAt: new Date('2027-08-05T00:00:00.000Z'),
    })
    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          authorization: 'Bearer cairn_pat_test',
          'content-type': 'application/json',
          'mcp-protocol-version': '2025-06-18',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      }),
    )

    expect(response.status).toBe(200)
    const eventBody = await response.text()
    const dataLine = eventBody.split('\n').find((line) => line.startsWith('data: '))
    expect(dataLine).toBeDefined()
    const result = JSON.parse(dataLine!.slice('data: '.length)) as {
      result: { tools: Array<{ name: string }> }
    }
    expect(result.result.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['list_files', 'read_file']),
    )
  }, 15_000)
})
