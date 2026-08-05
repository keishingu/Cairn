// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'

const { mockVerifyApiToken, mockVerifyOAuthToken, mockListProjects } = vi.hoisted(() => ({
  mockVerifyApiToken: vi.fn(),
  mockVerifyOAuthToken: vi.fn(),
  mockListProjects: vi.fn(() => Response.json([{ id: 'project-1', name: 'Project' }])),
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
vi.mock('@/lib/mcp-oauth', () => ({
  OAUTH_ACCESS_TOKEN_PREFIX: 'cairn_oauth_at_',
  McpOAuthError: class McpOAuthError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message)
    }
  },
  getMcpResource: (req: Request) => `${new URL(req.url).origin}/api/mcp`,
  getProtectedResourceMetadataUrl: (req: Request) =>
    `${new URL(req.url).origin}/.well-known/oauth-protected-resource`,
  verifyMcpOAuthAccessToken: mockVerifyOAuthToken,
}))
vi.mock('@/app/api/projects/route', () => ({ GET: mockListProjects }))

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
    await expect(response.json()).resolves.toEqual({ error: 'Bearer token required' })
    expect(response.headers.get('www-authenticate')).toContain(
      'resource_metadata="http://localhost/.well-known/oauth-protected-resource"',
    )
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

  it('OAuth access tokenでinitialize・tools/list・tools/callを実行する', async () => {
    mockVerifyOAuthToken.mockResolvedValue({
      kind: 'oauth',
      id: 'access-1',
      connectionId: 'connection-1',
      clientId: 'client-1',
      userId: 'user-1',
      workspaceId: 'workspace-1',
      role: 'member',
      scope: 'write',
      expiresAt: new Date('2027-08-05T00:00:00.000Z'),
    })
    const { POST } = await import('./route')
    const send = (body: unknown) =>
      POST(
        new Request('http://localhost/api/mcp', {
          method: 'POST',
          headers: {
            accept: 'application/json, text/event-stream',
            authorization: 'Bearer cairn_oauth_at_test',
            'content-type': 'application/json',
            'mcp-protocol-version': '2025-06-18',
          },
          body: JSON.stringify(body),
        }),
      )

    const initialize = await send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'Claude', version: '1' },
      },
    })
    expect(initialize.status).toBe(200)

    const toolsList = await send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    expect(toolsList.status).toBe(200)
    expect(await toolsList.text()).toContain('list_projects')

    const toolCall = await send({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'list_projects', arguments: {} },
    })
    expect(toolCall.status).toBe(200)
    expect(await toolCall.text()).toContain('project-1')
    expect(mockVerifyOAuthToken).toHaveBeenCalledWith(
      'cairn_oauth_at_test',
      expect.objectContaining({ resource: 'http://localhost/api/mcp', consumeRateLimit: true }),
    )
  }, 15_000)
})
