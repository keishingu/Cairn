// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

// --- vi.hoisted: vi.mock ファクトリから参照できるよう先に定義 ---
const { mockGetAuthContext, mockGetUserById, mockGenerateLink } = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn()
  const mockGetUserById = vi.fn()
  const mockGenerateLink = vi.fn()
  return { mockGetAuthContext, mockGetUserById, mockGenerateLink }
})

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: vi.fn(() => ({
    auth: {
      admin: {
        getUserById: mockGetUserById,
        generateLink: mockGenerateLink,
      },
    },
  })),
}))

function authed() {
  mockGetAuthContext.mockResolvedValue({
    ctx: { userId: 'user-1', workspaceId: 'ws-1' },
    error: null,
  })
}

describe('POST /api/auth/webview-handoff', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('未認証なら 401 を返し、トークン発行を行わない', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const { POST } = await import('./route')
    const res = await POST()

    expect(res.status).toBe(401)
    expect(mockGetUserById).not.toHaveBeenCalled()
    expect(mockGenerateLink).not.toHaveBeenCalled()
  })

  it('認証済みユーザーの email で magiclink を発行し tokenHash と workspaceId を返す', async () => {
    authed()
    mockGetUserById.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'me@example.com' } },
      error: null,
    })
    mockGenerateLink.mockResolvedValue({
      data: { properties: { hashed_token: 'hashed-abc' } },
      error: null,
    })

    const { POST } = await import('./route')
    const res = await POST()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      tokenHash: 'hashed-abc',
      workspaceId: 'ws-1',
    })
    // email はリクエストではなく認証済みユーザーから解決すること
    expect(mockGetUserById).toHaveBeenCalledWith('user-1')
    expect(mockGenerateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'me@example.com' })
  })

  it('ユーザーの email が取得できない場合は 500 を返し、リンク発行を行わない', async () => {
    authed()
    mockGetUserById.mockResolvedValue({
      data: { user: { id: 'user-1', email: null } },
      error: null,
    })

    const { POST } = await import('./route')
    const res = await POST()

    expect(res.status).toBe(500)
    expect(mockGenerateLink).not.toHaveBeenCalled()
  })

  it('magiclink 発行に失敗した場合は 500 を返す', async () => {
    authed()
    mockGetUserById.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'me@example.com' } },
      error: null,
    })
    mockGenerateLink.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const { POST } = await import('./route')
    const res = await POST()

    expect(res.status).toBe(500)
  })
})
