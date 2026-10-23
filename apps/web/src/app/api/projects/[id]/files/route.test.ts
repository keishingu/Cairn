// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'

const { mockGetAuthContext } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))

import { GET } from './route'

describe('GET /api/projects/[id]/files', () => {
  it('MCP内部の読み取りPATを許可する認証設定を使用する', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: null,
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    })

    const response = await GET(new Request('http://localhost/api/projects/project-1/files'), {
      params: Promise.resolve({ id: 'project-1' }),
    })

    expect(response.status).toBe(401)
    expect(mockGetAuthContext).toHaveBeenCalledWith({
      allowApiToken: true,
      requiredApiTokenScope: 'read',
    })
  })
})
