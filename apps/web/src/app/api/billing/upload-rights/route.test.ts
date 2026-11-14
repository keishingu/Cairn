// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockGetAuthContext, mockResolveUploadEntitlements } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockResolveUploadEntitlements: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/billing/entitlements', () => ({
  resolveUploadEntitlements: mockResolveUploadEntitlements,
}))

describe('/api/billing/upload-rights GET', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('本人のワークスペースでの動画アップロード権と原本の取得権を返す', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'u1', workspaceId: 'w1', role: 'guest' },
      error: null,
    })
    mockResolveUploadEntitlements.mockResolvedValue({
      rights: { canUploadOriginal: true, canUploadLargeFile: true, canUploadVideo: true, canDownloadOriginal: true },
    })
    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ canUploadVideo: true, canDownloadOriginal: true })
    expect(mockResolveUploadEntitlements).toHaveBeenCalledWith('w1', 'u1')
  })

  it('支援状態を取得できなければ権利なしとして返さずエラーにする', async () => {
    mockGetAuthContext.mockResolvedValue({ ctx: { userId: 'u1', workspaceId: 'w1', role: 'member' }, error: null })
    mockResolveUploadEntitlements.mockRejectedValue(new Error('db down'))
    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(500)
  })
})
