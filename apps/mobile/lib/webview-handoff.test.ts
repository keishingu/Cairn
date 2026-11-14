import { AuthApiError, AuthRetryableFetchError, type Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestWebViewHandoff } from './webview-handoff'

const { getSession, refreshSession, signOut, apiFetch } = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
  apiFetch: vi.fn(),
}))

vi.mock('./supabase', () => ({ supabase: { auth: { getSession, refreshSession, signOut } } }))
vi.mock('./api-fetch', () => ({ apiFetch }))

const session = { access_token: 'native-fixture' } as Session

describe('ネイティブから WebView へのハンドオフ', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getSession.mockResolvedValue({ data: { session }, error: null })
  })

  it('ハンドオフが成功するときはネイティブの更新やログアウトを行わない', async () => {
    apiFetch.mockResolvedValue(Response.json({ tokenHash: 'handoff-fixture' }))
    expect((await requestWebViewHandoff()).status).toBe('ready')
    expect(refreshSession).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('ハンドオフAPIの500でネイティブのログアウトを行わない', async () => {
    apiFetch.mockResolvedValue(new Response(null, { status: 500 }))
    expect((await requestWebViewHandoff()).status).toBe('failed')
    expect(refreshSession).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
  })

  it.each([0, 503])('401後の更新で一時エラー %s が起きてもネイティブを維持する', async (status) => {
    apiFetch.mockResolvedValue(new Response(null, { status: 401 }))
    refreshSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError('fixture', status),
    })
    expect((await requestWebViewHandoff()).status).toBe('failed')
    expect(apiFetch).toHaveBeenCalledOnce()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('401後の更新が成功すると新しいセッションでハンドオフを一度再試行する', async () => {
    const updated = { ...session, access_token: 'updated-fixture' }
    apiFetch.mockResolvedValueOnce(new Response(null, { status: 401 }))
    apiFetch.mockResolvedValueOnce(Response.json({ tokenHash: 'handoff-fixture' }))
    refreshSession.mockResolvedValue({ data: { session: updated }, error: null })
    expect((await requestWebViewHandoff()).status).toBe('ready')
    expect(apiFetch.mock.calls[1]?.[2]).toBe(updated)
    expect(refreshSession).toHaveBeenCalledOnce()
  })

  it('ネイティブの更新トークンが失効したときだけ再認証を要求する', async () => {
    apiFetch.mockResolvedValue(new Response(null, { status: 401 }))
    refreshSession.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError('fixture', 400, 'refresh_token_not_found'),
    })
    expect((await requestWebViewHandoff()).status).toBe('signed-out')
    expect(signOut).not.toHaveBeenCalled()
  })
})
