// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { z } from 'zod'

const { mockGetAuthContext } = vi.hoisted(() => ({ mockGetAuthContext: vi.fn() }))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('./workspace-research', () => ({
  ResearchAccessError: class ResearchAccessError extends Error {
    readonly code = 'ACCESS_DENIED'
  },
}))

const CTX = {
  workspaceId: '10000000-0000-4000-8000-000000000001',
  userId: '20000000-0000-4000-8000-000000000001',
  role: 'member' as const,
}

describe('MCP向け調査Route Handlerの共通処理', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({ ctx: CTX, error: null })
  })

  test('PAT・OAuthのread scopeで認証し、繰り返しクエリを配列として渡す', async () => {
    const { queryArray, queryBoolean, researchRoute } = await import('./research-route')
    const read = vi.fn(async () => ({ ok: true, items: [] }))
    const response = await researchRoute(
      new Request('http://cairn.local/api/research/members?attribute=a&attribute=b&includeInactive=true'),
      z.object({ attribute: queryArray(z.string()), includeInactive: queryBoolean }),
      read,
      'test',
    )

    expect(response.status).toBe(200)
    expect(mockGetAuthContext).toHaveBeenCalledWith({ allowApiToken: true, requiredApiTokenScope: 'read' })
    expect(read).toHaveBeenCalledWith(CTX, { attribute: ['a', 'b'], includeInactive: true })
  })

  test('単一値のクエリも配列として渡す', async () => {
    const { queryArray, researchRoute } = await import('./research-route')
    const read = vi.fn(async () => ({ ok: true }))
    await researchRoute(
      new Request('http://cairn.local/api/research/members?attribute=a'),
      z.object({ attribute: queryArray(z.string()) }),
      read,
      'test',
    )
    expect(read).toHaveBeenCalledWith(CTX, { attribute: ['a'] })
  })

  test('不正なクエリは調査を実行せず422を返す', async () => {
    const { queryLimit, researchRoute } = await import('./research-route')
    const read = vi.fn()
    const response = await researchRoute(
      new Request('http://cairn.local/api/research/channels?limit=abc'),
      z.object({ limit: queryLimit }),
      read,
      'test',
    )
    expect(response.status).toBe(422)
    expect(read).not.toHaveBeenCalled()
  })

  test('アクセスできない対象は403、想定外の失敗は500として返す', async () => {
    const { researchRoute } = await import('./research-route')
    const { ResearchAccessError } = await import('./workspace-research')
    const denied = await researchRoute(
      new Request('http://cairn.local/api/research/channels'),
      z.object({}),
      async () => {
        throw new ResearchAccessError('指定されたチャンネルは見つからないか、アクセスできません')
      },
      'test',
    )
    expect(denied.status).toBe(403)
    await expect(denied.json()).resolves.toEqual({
      error: '指定されたチャンネルは見つからないか、アクセスできません',
    })

    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const failed = await researchRoute(
      new Request('http://cairn.local/api/research/channels'),
      z.object({}),
      async () => {
        throw new Error('database unavailable')
      },
      'test',
    )
    expect(failed.status).toBe(500)
  })

  test('認証に失敗したら調査を実行せずそのエラーを返す', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: null,
      error: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })
    const { researchRoute } = await import('./research-route')
    const read = vi.fn()
    const response = await researchRoute(
      new Request('http://cairn.local/api/research/channels'),
      z.object({}),
      read,
      'test',
    )
    expect(response.status).toBe(401)
    expect(read).not.toHaveBeenCalled()
  })
})
