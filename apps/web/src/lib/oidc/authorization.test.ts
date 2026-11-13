// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDb, clientRows, grantRows, insertValues } = vi.hoisted(() => {
  const clientRows: { current: unknown[] } = { current: [] }
  const grantRows: { current: unknown[] } = { current: [] }
  const insertValues = vi.fn(async () => [])
  const mockDb = {
    transaction: vi.fn(async (fn) => fn({
      select: () => ({ from: () => ({ where: () => ({ limit: () => ({ for: async () => grantRows.current }) }) }) }),
      insert: () => ({ values: insertValues }),
      update: () => ({ set: () => ({ where: async () => [] }) }),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => clientRows.current) })) })),
    })),
  }
  return { mockDb, clientRows, grantRows, insertValues }
})

vi.mock('@cairn/db', () => ({
  db: mockDb,
  oidcGrants: { id: 'id', userId: 'userId', clientId: 'clientId', scope: 'scope', revokedAt: 'revokedAt' },
  oidcAuthorizationCodes: {},
  oidcClients: { clientId: 'clientId', clientName: 'clientName', redirectUris: 'redirectUris', disabledAt: 'disabledAt' },
}))
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn(), isNull: vi.fn() }))

import { buildOidcRedirect, issueOidcAuthorizationCode, OidcAuthorizeError, validateOidcAuthorizationRequest } from './authorization'

const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

function params(overrides: Record<string, string | null> = {}) {
  const base: Record<string, string | null> = {
    client_id: 'cairn_oidc_client_x',
    redirect_uri: 'https://app.example/callback',
    response_type: 'code',
    scope: 'openid profile',
    state: 'st',
    nonce: 'nn',
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    ...overrides,
  }
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(base)) if (value !== null) search.set(key, value)
  return search
}

async function rejection(search: URLSearchParams): Promise<OidcAuthorizeError> {
  try {
    await validateOidcAuthorizationRequest(search)
  } catch (error) {
    if (error instanceof OidcAuthorizeError) return error
    throw error
  }
  throw new Error('expected rejection')
}

describe('validateOidcAuthorizationRequest', () => {
  beforeEach(() => {
    clientRows.current = [{ clientName: 'Rack', redirectUris: ['https://app.example/callback'] }]
  })

  it('正しいリクエストを検証し、スコープを並べ直して返す', async () => {
    const result = await validateOidcAuthorizationRequest(params({ scope: 'profile openid' }))

    expect(result).toEqual({
      clientId: 'cairn_oidc_client_x',
      clientName: 'Rack',
      redirectUri: 'https://app.example/callback',
      scope: 'openid profile',
      state: 'st',
      nonce: 'nn',
      codeChallenge: CHALLENGE,
    })
  })

  it('知らないクライアントは外部アプリへ戻さずに画面で止める', async () => {
    clientRows.current = []

    const error = await rejection(params())

    expect(error.code).toBe('invalid_client')
    expect(error.redirect).toBeNull()
  })

  it('登録と一致しない redirect_uri は、その URL へ戻さずに画面で止める', async () => {
    const error = await rejection(params({ redirect_uri: 'https://evil.example/callback' }))

    expect(error.redirect).toBeNull()
  })

  it('redirect_uri を確かめた後の誤りは、error と state を付けて戻す', async () => {
    const error = await rejection(params({ scope: 'profile' }))

    expect(error.code).toBe('invalid_scope')
    expect(error.redirect).toEqual({ uri: 'https://app.example/callback', state: 'st' })
  })

  it('PKCE（S256）が無いリクエストは受け付けない', async () => {
    expect((await rejection(params({ code_challenge_method: 'plain' }))).code).toBe('invalid_request')
    expect((await rejection(params({ code_challenge: null }))).code).toBe('invalid_request')
  })

  it('response_type が code 以外なら unsupported_response_type にする', async () => {
    expect((await rejection(params({ response_type: 'token' }))).code).toBe('unsupported_response_type')
  })
})

describe('buildOidcRedirect', () => {
  it('redirect_uri の既存のクエリを残して code と state を付け、空の値は付けない', () => {
    expect(buildOidcRedirect('https://app.example/cb?x=1', { code: 'c', state: null })).toBe(
      'https://app.example/cb?x=1&code=c',
    )
  })
})


describe('同意済み grant による自動認可', () => {
  const authorization = {
    clientId: 'client', clientName: 'App', redirectUri: 'https://app.example/callback',
    scope: 'openid profile', state: null, nonce: null, codeChallenge: CHALLENGE,
  }
  beforeEach(() => { insertValues.mockClear() })

  it('確認時に失効済みなら grant とコードを作らず同意を求める', async () => {
    grantRows.current = []
    expect(await issueOidcAuthorizationCode({ userId: 'user', authTime: new Date(), authorization }, true)).toBeNull()
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('有効な grant が不足するスコープを勝手に広げない', async () => {
    grantRows.current = [{ id: 'grant', scope: 'openid' }]
    expect(await issueOidcAuthorizationCode({ userId: 'user', authTime: new Date(), authorization }, true)).toBeNull()
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('有効な grant がスコープを含む場合はコードを発行する', async () => {
    grantRows.current = [{ id: 'grant', scope: 'openid profile' }]
    expect(await issueOidcAuthorizationCode({ userId: 'user', authTime: new Date(), authorization }, true)).toContain('code=')
    expect(insertValues).toHaveBeenCalledOnce()
  })
})
