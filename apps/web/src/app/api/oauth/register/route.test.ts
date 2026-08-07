// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockValues } = vi.hoisted(() => ({ mockValues: vi.fn() }))

vi.mock('@cairn/db', () => ({
  db: { insert: vi.fn(() => ({ values: mockValues })) },
  mcpOAuthClients: {},
}))

describe('OAuth Dynamic Client Registration', () => {
  beforeEach(() => mockValues.mockReset().mockResolvedValue(undefined))

  it('Claude callbackをpublic clientとして登録しsecretを発行しない', async () => {
    const { POST } = await import('./route')
    const response = await POST(
      new Request('https://develop.oss-cairn.com/api/oauth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Claude',
          redirect_uris: [
            'https://claude.ai/api/mcp/auth_callback',
            'https://claude.com/api/mcp/auth_callback',
          ],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        }),
      }),
    )

    expect(response.status).toBe(201)
    const body = (await response.json()) as Record<string, unknown>
    expect(body['client_id']).toMatch(/^cairn_oauth_client_/)
    expect(body['client_secret']).toBeUndefined()
    expect(body['token_endpoint_auth_method']).toBe('none')
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ clientName: 'Claude', applicationType: 'web' }),
    )
  })

  it('非HTTPSかつ非loopbackのredirect URIを拒否する', async () => {
    const { POST } = await import('./route')
    const response = await POST(
      new Request('https://develop.oss-cairn.com/api/oauth/register', {
        method: 'POST',
        body: JSON.stringify({
          client_name: 'Unsafe client',
          redirect_uris: ['http://example.com/callback'],
        }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_redirect_uri' })
    expect(mockValues).not.toHaveBeenCalled()
  })
})
