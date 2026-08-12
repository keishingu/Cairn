// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAuthContext, mockRunForActiveMembership, mockUpload, mockRemove, mockUpdate } =
  vi.hoisted(() => ({
    mockGetAuthContext: vi.fn(),
    mockRunForActiveMembership: vi.fn(),
    mockUpload: vi.fn().mockResolvedValue({ error: null }),
    mockRemove: vi.fn().mockResolvedValue({ error: null }),
    mockUpdate: vi.fn(),
  }))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/access/active-membership-lock', () => ({
  runForActiveMembership: mockRunForActiveMembership,
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: () => ({
    storage: {
      from: () => ({
        upload: mockUpload,
        remove: mockRemove,
        getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/avatar.png' } }),
      }),
    },
  }),
}))
vi.mock('@cairn/db', () => ({ db: {}, workspaceMembers: {} }))
vi.mock('drizzle-orm', () => ({ and: vi.fn(() => 'and'), eq: vi.fn(() => 'eq') }))

function avatarRequest(): Request {
  const formData = new FormData()
  const file = new File(['avatar'], 'avatar.png', { type: 'image/png' })
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(new TextEncoder().encode('avatar').buffer),
  })
  formData.set('file', file)
  return { formData: () => Promise.resolve(formData) } as Request
}

describe('POST /api/me/avatar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1' },
      error: null,
    })
    const tx = {
      update: () => ({ set: () => ({ where: mockUpdate.mockResolvedValue(undefined) }) }),
    }
    mockRunForActiveMembership.mockImplementation((_db, _workspaceId, _userId, action) =>
      action(tx),
    )
  })

  it('active membershipを保持したままStorageとmembershipを更新する', async () => {
    const { POST } = await import('./route')
    const response = await POST(avatarRequest())

    expect(response.status).toBe(200)
    expect(mockRunForActiveMembership).toHaveBeenCalledWith(
      expect.anything(),
      'workspace-1',
      'user-1',
      expect.any(Function),
    )
    expect(mockUpload).toHaveBeenCalledOnce()
    expect(mockUpdate).toHaveBeenCalledOnce()
  })

  it('退会済みならStorageへアップロードしない', async () => {
    mockRunForActiveMembership.mockResolvedValue(null)

    const { POST } = await import('./route')
    const response = await POST(avatarRequest())

    expect(response.status).toBe(403)
    expect(mockUpload).not.toHaveBeenCalled()
  })
})
