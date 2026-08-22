// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { state } = vi.hoisted(() => ({
  state: {
    selectedRow: null as Record<string, unknown> | null,
    rateLimitCount: 1,
  },
}))

const schema = vi.hoisted(() => ({
  activeWorkspaceMembers: {
    workspaceId: 'awm.workspaceId',
    userId: 'awm.userId',
    role: 'awm.role',
  },
  mcpOAuthAccessTokens: {
    id: 'at.id',
    connectionId: 'at.connectionId',
    tokenHash: 'at.tokenHash',
    expiresAt: 'at.expiresAt',
    rateLimitWindowStartedAt: 'at.window',
    rateLimitCount: 'at.count',
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
}))

function selectChain() {
  return {
    from: () => ({
      innerJoin: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: vi
              .fn()
              .mockImplementation(async () => (state.selectedRow ? [state.selectedRow] : [])),
          }),
        }),
      }),
    }),
  }
}

vi.mock('@cairn/db', () => ({
  ...schema,
  db: {
    select: vi.fn(() => selectChain()),
    update: vi.fn(() => ({
      set: () => ({
        where: () => ({
          returning: vi.fn().mockImplementation(async () => [{ count: state.rateLimitCount }]),
        }),
      }),
    })),
  },
}))

const validRow = () => ({
  id: 'access-1',
  connectionId: 'connection-1',
  clientId: 'client-1',
  userId: 'user-1',
  workspaceId: 'workspace-1',
  scope: 'write',
  expiresAt: new Date(Date.now() + 60_000),
  role: 'member',
})

describe('MCP OAuth access token検証', () => {
  beforeEach(() => {
    state.selectedRow = validRow()
    state.rateLimitCount = 1
  })

  it('active membershipの現在roleと固定workspaceを返す', async () => {
    state.selectedRow = { ...validRow(), role: 'admin' }
    const { verifyMcpOAuthAccessToken } = await import('./mcp-oauth')
    await expect(
      verifyMcpOAuthAccessToken('cairn_oauth_at_test', {
        requiredScope: 'read',
        resource: 'https://develop.oss-cairn.com/api/mcp',
      }),
    ).resolves.toMatchObject({ workspaceId: 'workspace-1', role: 'admin', scope: 'write' })
  })

  it('read tokenによるwrite操作を拒否する', async () => {
    state.selectedRow = { ...validRow(), scope: 'read' }
    const { verifyMcpOAuthAccessToken } = await import('./mcp-oauth')
    await expect(
      verifyMcpOAuthAccessToken('cairn_oauth_at_test', {
        requiredScope: 'write',
        resource: 'https://develop.oss-cairn.com/api/mcp',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'insufficient_scope' })
  })

  it.each(['期限切れ', '接続取り消し後', 'inactive member', '別workspace/resource'])(
    '%sは401で拒否する',
    async () => {
      // 実DBではexpires/resource/revokedAt/active membership joinのいずれかを満たさず0件になる。
      state.selectedRow = null
      const { verifyMcpOAuthAccessToken } = await import('./mcp-oauth')
      await expect(
        verifyMcpOAuthAccessToken('cairn_oauth_at_test', {
          requiredScope: 'read',
          resource: 'https://develop.oss-cairn.com/api/mcp',
        }),
      ).rejects.toMatchObject({ status: 401, code: 'invalid_token' })
    },
  )

  it('guestをMCP利用時にも拒否する', async () => {
    state.selectedRow = { ...validRow(), role: 'guest' }
    const { verifyMcpOAuthAccessToken } = await import('./mcp-oauth')
    await expect(
      verifyMcpOAuthAccessToken('cairn_oauth_at_test', {
        requiredScope: 'read',
        resource: 'https://develop.oss-cairn.com/api/mcp',
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('毎分120件を超えたOAuth access tokenを429で拒否する', async () => {
    state.rateLimitCount = 121
    const { verifyMcpOAuthAccessToken } = await import('./mcp-oauth')
    await expect(
      verifyMcpOAuthAccessToken('cairn_oauth_at_test', {
        requiredScope: 'read',
        resource: 'https://develop.oss-cairn.com/api/mcp',
        consumeRateLimit: true,
      }),
    ).rejects.toMatchObject({ status: 429, code: 'slow_down' })
  })
})
