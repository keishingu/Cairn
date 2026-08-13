// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetAuthContext = vi.fn()
const mockExchangeCodeForTokens = vi.fn()
const mockListCalendars = vi.fn()
const mockEncryptToken = vi.fn((value: string) => `enc:${value}`)

const mockSelect = vi.fn()
const mockUpdateSet = vi.fn()
const mockInsertValues = vi.fn()
const mockDb = {
  select: mockSelect,
  update: vi.fn(() => ({ set: mockUpdateSet })),
  insert: vi.fn(() => ({ values: mockInsertValues })),
}

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/google-calendar-api', () => ({
  exchangeCodeForTokens: mockExchangeCodeForTokens,
  listCalendars: mockListCalendars,
}))

vi.mock('@/lib/token-crypto', () => ({
  encryptToken: mockEncryptToken,
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  connectedAccounts: {
    id: 'ca.id',
    metadata: 'ca.metadata',
    userId: 'ca.userId',
    provider: 'ca.provider',
    providerAccountId: 'ca.providerAccountId',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
}))

function selectChain(result: unknown[]) {
  const promise = Promise.resolve(result)
  const chain: Record<string, unknown> = {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  }
  for (const method of ['from', 'where', 'limit']) {
    chain[method] = vi.fn().mockReturnValue(chain)
  }
  return chain
}

function createRequest() {
  return new NextRequest('http://localhost/api/calendar/google/callback?code=test-code&state=test-state', {
    headers: { cookie: 'gcal_oauth_state=test-state' },
  })
}

describe('/api/calendar/google/callback GET', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1' },
      error: null,
    })
    mockExchangeCodeForTokens.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
      email: 'user@example.com',
    })
    mockListCalendars.mockResolvedValue([
      { id: 'cal-1', summary: 'Team', backgroundColor: '#111111' },
      { id: 'cal-2', summary: 'Private', backgroundColor: '#222222' },
    ])
    mockUpdateSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })
    mockInsertValues.mockResolvedValue(undefined)
  })

  it('再接続時は既存の selectedCalendars を維持する', async () => {
    mockSelect.mockReturnValueOnce(selectChain([
      {
        id: 'account-1',
        metadata: {
          googleAccountEmail: 'user@example.com',
          selectedCalendars: [{ id: 'cal-1', name: 'Old name', color: '#999999' }],
        },
      },
    ]))

    const { GET } = await import('./route')
    const res = await GET(createRequest())

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/settings/integrations?gcal=connected')
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      metadata: {
        googleAccountEmail: 'user@example.com',
        selectedCalendars: [{ id: 'cal-1', name: 'Team', color: '#111111' }],
      },
    }))
  })

  it('初回接続時は取得した全カレンダーを selectedCalendars に保存する', async () => {
    mockSelect.mockReturnValueOnce(selectChain([]))

    const { GET } = await import('./route')
    const res = await GET(createRequest())

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/settings/integrations?gcal=connected')
    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      metadata: {
        googleAccountEmail: 'user@example.com',
        selectedCalendars: [
          { id: 'cal-1', name: 'Team', color: '#111111' },
          { id: 'cal-2', name: 'Private', color: '#222222' },
        ],
      },
    }))
  })
})
