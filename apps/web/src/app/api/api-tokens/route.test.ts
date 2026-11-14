// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAuthContext, mockRequireRole, mockValues } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireRole: vi.fn(),
  mockValues: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireRole: mockRequireRole }))
vi.mock('@cairn/db', () => ({
  apiTokens: {},
  db: {
    insert: () => ({
      values: (values: { name: string; tokenPrefix: string; scope: string; createdAt: Date; expiresAt: Date }) => {
        mockValues(values)
        return {
          returning: async () => [
            {
              id: 'token-1',
              name: values.name,
              prefix: values.tokenPrefix,
              scope: values.scope,
              createdAt: values.createdAt,
              expiresAt: values.expiresAt,
            },
          ],
        }
      },
    }),
  },
}))

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

  it('最長の365日でも、期限が作成日時からちょうど1年になる（DB の最長期間の制約を超えない）', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1', role: 'member' },
      error: null,
    })
    mockRequireRole.mockReturnValue(null)
    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost/api/api-tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Rack', scope: 'read', expiresInDays: 365 }),
      }),
    )

    expect(response.status).toBe(201)
    const values = mockValues.mock.calls[0]![0] as { createdAt: Date; expiresAt: Date }
    expect(values.createdAt).toBeInstanceOf(Date)
    expect(values.expiresAt.getTime() - values.createdAt.getTime()).toBe(365 * 24 * 60 * 60 * 1000)
  })
})
