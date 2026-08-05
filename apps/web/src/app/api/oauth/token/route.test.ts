// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { state, mockInsertValues, mockUpdateSet } = vi.hoisted(() => ({
  state: { selectedRow: null as Record<string, unknown> | null },
  mockInsertValues: vi.fn().mockResolvedValue(undefined),
  mockUpdateSet: vi.fn(),
}))

const tables = vi.hoisted(() => ({
  activeWorkspaceMembers: {
    workspaceId: 'awm.workspaceId',
    userId: 'awm.userId',
    role: 'awm.role',
  },
  mcpOAuthAccessTokens: { connectionId: 'at.connectionId' },
  mcpOAuthAuthorizationCodes: {
    id: 'code.id',
    connectionId: 'code.connectionId',
    codeHash: 'code.codeHash',
    redirectUri: 'code.redirectUri',
    codeChallenge: 'code.codeChallenge',
    expiresAt: 'code.expiresAt',
    usedAt: 'code.usedAt',
  },
  mcpOAuthConnections: {
    id: 'connection.id',
    clientId: 'connection.clientId',
    userId: 'connection.userId',
    workspaceId: 'connection.workspaceId',
    scope: 'connection.scope',
    resource: 'connection.resource',
    revokedAt: 'connection.revokedAt',
  },
  mcpOAuthRefreshTokens: {
    id: 'refresh.id',
    connectionId: 'refresh.connectionId',
    tokenHash: 'refresh.tokenHash',
    expiresAt: 'refresh.expiresAt',
    usedAt: 'refresh.usedAt',
    revokedAt: 'refresh.revokedAt',
  },
}))

function selectChain() {
  return {
    from: () => ({
      innerJoin: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => ({
              for: vi
                .fn()
                .mockImplementation(async () => (state.selectedRow ? [state.selectedRow] : [])),
            }),
          }),
        }),
      }),
    }),
  }
}

const tx = vi.hoisted(() => ({
  select: vi.fn(() => selectChain()),
  insert: vi.fn(() => ({ values: mockInsertValues })),
  update: vi.fn(() => ({
    set: (values: unknown) => {
      mockUpdateSet(values)
      return { where: vi.fn().mockResolvedValue(undefined) }
    },
  })),
}))

vi.mock('@cairn/db', () => ({
  ...tables,
  db: { transaction: vi.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) },
}))

const verifier = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~'
const challenge = createHash('sha256').update(verifier).digest('base64url')

function tokenRequest(values: Record<string, string>) {
  return new Request('https://develop.oss-cairn.com/api/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
  })
}

const codeRow = () => ({
  codeId: 'code-1',
  connectionId: 'connection-1',
  clientId: 'client-1',
  scope: 'write',
  resource: 'https://develop.oss-cairn.com/api/mcp',
  redirectUri: 'https://claude.ai/api/mcp/auth_callback',
  codeChallenge: challenge,
  expiresAt: new Date(Date.now() + 60_000),
  usedAt: null,
  role: 'member',
})

const refreshRow = () => ({
  refreshId: 'refresh-1',
  connectionId: 'connection-1',
  clientId: 'client-1',
  scope: 'write',
  resource: 'https://develop.oss-cairn.com/api/mcp',
  expiresAt: new Date(Date.now() + 60_000),
  usedAt: null,
  revokedAt: null,
  role: 'member',
})

describe('OAuth token endpoint', () => {
  beforeEach(() => {
    state.selectedRow = null
    mockInsertValues.mockClear()
    mockUpdateSet.mockClear()
    tx.select.mockClear()
    tx.insert.mockClear()
    tx.update.mockClear()
  })

  it('Authorization Code + PKCEで短命access tokenとrefresh tokenを発行する', async () => {
    state.selectedRow = codeRow()
    const { POST } = await import('./route')
    const response = await POST(
      tokenRequest({
        grant_type: 'authorization_code',
        client_id: 'client-1',
        code: 'cairn_oauth_code_test',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        code_verifier: verifier,
        resource: 'https://develop.oss-cairn.com/api/mcp',
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'read write' })
    expect(body.access_token).toMatch(/^cairn_oauth_at_/)
    expect(body.refresh_token).toMatch(/^cairn_oauth_rt_/)
    expect(mockInsertValues).toHaveBeenCalledTimes(2)
    for (const [inserted] of mockInsertValues.mock.calls) {
      expect(inserted).not.toHaveProperty('token')
      expect(inserted.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    }
  })

  it.each([
    ['不正code verifier', { code_verifier: `${verifier}x` }],
    ['redirect URI不一致', { redirect_uri: 'https://claude.com/api/mcp/auth_callback' }],
  ])('%sをinvalid_grantで拒否する', async (_label, override) => {
    state.selectedRow = codeRow()
    const { POST } = await import('./route')
    const response = await POST(
      tokenRequest({
        grant_type: 'authorization_code',
        client_id: 'client-1',
        code: 'cairn_oauth_code_test',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        code_verifier: verifier,
        resource: 'https://develop.oss-cairn.com/api/mcp',
        ...override,
      }),
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_grant' })
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('認可コードの再利用を拒否する', async () => {
    state.selectedRow = { ...codeRow(), usedAt: new Date() }
    const { POST } = await import('./route')
    const response = await POST(
      tokenRequest({
        grant_type: 'authorization_code',
        client_id: 'client-1',
        code: 'cairn_oauth_code_test',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        code_verifier: verifier,
        resource: 'https://develop.oss-cairn.com/api/mcp',
      }),
    )
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_grant' })
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('refresh tokenをローテーションする', async () => {
    state.selectedRow = refreshRow()
    const { POST } = await import('./route')
    const response = await POST(
      tokenRequest({
        grant_type: 'refresh_token',
        client_id: 'client-1',
        refresh_token: 'cairn_oauth_rt_test',
        resource: 'https://develop.oss-cairn.com/api/mcp',
      }),
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.access_token).toMatch(/^cairn_oauth_at_/)
    expect(body.refresh_token).toMatch(/^cairn_oauth_rt_/)
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ usedAt: expect.any(Date) }),
    )
    expect(mockInsertValues).toHaveBeenCalledTimes(2)
  })

  it('refresh token再利用時は接続全体を失効する', async () => {
    state.selectedRow = { ...refreshRow(), usedAt: new Date() }
    const { POST } = await import('./route')
    const response = await POST(
      tokenRequest({
        grant_type: 'refresh_token',
        client_id: 'client-1',
        refresh_token: 'cairn_oauth_rt_reused',
        resource: 'https://develop.oss-cairn.com/api/mcp',
      }),
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'invalid_grant',
      error_description: 'Refresh token reuse revoked the connection',
    })
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    )
  })

  it.each([
    ['失効済み接続', null],
    ['inactive member', null],
    ['guest', { ...refreshRow(), role: 'guest' }],
    ['期限切れ', { ...refreshRow(), expiresAt: new Date(Date.now() - 1) }],
  ])('%sではrefresh tokenを拒否する', async (_label, row) => {
    state.selectedRow = row
    const { POST } = await import('./route')
    const response = await POST(
      tokenRequest({
        grant_type: 'refresh_token',
        client_id: 'client-1',
        refresh_token: 'cairn_oauth_rt_test',
        resource: 'https://develop.oss-cairn.com/api/mcp',
      }),
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_grant' })
  })

  it('別resource向けのtoken要求を拒否する', async () => {
    const { POST } = await import('./route')
    const response = await POST(
      tokenRequest({
        grant_type: 'refresh_token',
        client_id: 'client-1',
        refresh_token: 'cairn_oauth_rt_test',
        resource: 'https://develop.oss-cairn.com/api/other',
      }),
    )
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_target' })
    expect(tx.select).not.toHaveBeenCalled()
  })
})
