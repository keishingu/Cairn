// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { redirectMock, issueMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`)
  }),
  issueMock: vi.fn(async () => 'https://app.example/cb?code=c&state=st'),
}))

vi.mock('next/navigation', () => ({ redirect: redirectMock }))
vi.mock('@/lib/get-auth-context', () => ({
  getAuthUser: vi.fn(async () => ({ userId: 'user-1', user: { last_sign_in_at: '2026-11-03T00:00:00Z' }, error: null })),
}))
vi.mock('@/lib/oidc/authorization', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/oidc/authorization')>()
  return {
    ...actual,
    validateOidcAuthorizationRequest: vi.fn(async () => ({ redirectUri: 'https://app.example/cb', state: 'st' })),
    issueOidcAuthorizationCode: issueMock,
  }
})

import { decideOidcAuthorization } from './actions'

function form(decisions: string[]) {
  const data = new FormData()
  data.set('client_id', 'cairn_oidc_client_x')
  for (const decision of decisions) data.append('decision', decision)
  return data
}

async function destination(decisions: string[]) {
  try {
    await decideOidcAuthorization(null, form(decisions))
  } catch (error) {
    return (error as Error).message.replace(/^redirect:/, '')
  }
  throw new Error('expected redirect')
}

describe('decideOidcAuthorization', () => {
  beforeEach(() => issueMock.mockClear())

  it('許可を押したらコードを発行して戻す', async () => {
    expect(await destination(['approve'])).toBe('https://app.example/cb?code=c&state=st')
    expect(issueMock).toHaveBeenCalledOnce()
  })

  it('拒否を押したら access_denied で戻す', async () => {
    expect(await destination(['deny'])).toBe('https://app.example/cb?error=access_denied&state=st')
    expect(issueMock).not.toHaveBeenCalled()
  })

  it('decision が複数送られたら、先頭が approve でも許可として扱わない', async () => {
    expect(await destination(['approve', 'deny'])).toBe('https://app.example/cb?error=access_denied&state=st')
    expect(issueMock).not.toHaveBeenCalled()
  })
})
