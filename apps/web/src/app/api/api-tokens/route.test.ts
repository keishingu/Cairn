// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAuthContext, mockRequireRole } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireRole: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireRole: mockRequireRole }))

describe('POST /api/api-tokens', () => {
  beforeEach(() => vi.clearAllMocks())

  it('guestによるPAT発行を拒否する', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1', role: 'guest' },
      error: null,
    })
    mockRequireRole.mockReturnValue(
      new Response(JSON.stringify({ error: 'guest cannot issue tokens' }), { status: 403 }),
    )
    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost/api/api-tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Claude', scope: 'read' }),
      }),
    )

    expect(response.status).toBe(403)
  })
})
