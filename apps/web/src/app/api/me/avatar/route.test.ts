// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  DEV_USER_ID,
  DEV_WORKSPACE_ID,
  mockGetAuthContext,
  mockUpload,
  mockGetPublicUrl,
  mockRemove,
  mockCreateServiceRoleClient,
  mockDb,
} = vi.hoisted(() => {
  const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
  const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: {
      userId: DEV_USER_ID,
      workspaceId: DEV_WORKSPACE_ID,
    },
    error: null,
  })
  const mockUpload = vi.fn().mockResolvedValue({ error: null })
  const mockGetPublicUrl = vi.fn(() => ({
    data: { publicUrl: 'https://example.supabase.co/storage/v1/object/public/avatars/ws-1/user-1.png' },
  }))
  const mockRemove = vi.fn().mockResolvedValue({ error: null })
  const mockCreateServiceRoleClient = vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
        remove: mockRemove,
      })),
    },
  }))
  const mockDb = {
    update: vi.fn(),
  }
  return {
    DEV_USER_ID,
    DEV_WORKSPACE_ID,
    mockGetAuthContext,
    mockUpload,
    mockGetPublicUrl,
    mockRemove,
    mockCreateServiceRoleClient,
    mockDb,
  }
})

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  workspaceMembers: {
    userId: 'wm.userId',
    workspaceId: 'wm.workspaceId',
    membershipStatus: 'wm.membershipStatus',
    avatarUrl: 'wm.avatarUrl',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
}))

function updateChain(result: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(result),
      }),
    }),
  }
}

function createAvatarRequest() {
  const formData = new FormData()
  const file = new File(['avatar'], 'avatar.png', { type: 'image/png' })
  Object.defineProperty(file, 'arrayBuffer', {
    value: vi.fn().mockResolvedValue(new TextEncoder().encode('avatar').buffer),
  })
  formData.set('file', file)
  return {
    formData: vi.fn().mockResolvedValue(formData),
  } as unknown as Request
}

describe('POST /api/me/avatar', () => {
  beforeEach(() => {
    mockDb.update.mockReturnValue(updateChain([{ userId: DEV_USER_ID }]))
  })

  afterEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockUpload.mockResolvedValue({ error: null })
    mockRemove.mockResolvedValue({ error: null })
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://example.supabase.co/storage/v1/object/public/avatars/ws-1/user-1.png' },
    })
  })

  it('active member は avatar を更新できる', async () => {
    const { POST } = await import('./route')
    const res = await POST(createAvatarRequest())

    expect(res.status).toBe(200)
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('inactive member は upload 済みファイルを片付けて 409 を返す', async () => {
    mockDb.update.mockReturnValueOnce(updateChain([]))

    const { POST } = await import('./route')
    const res = await POST(createAvatarRequest())

    expect(res.status).toBe(409)
    expect(mockRemove).toHaveBeenCalledWith([`${DEV_WORKSPACE_ID}/${DEV_USER_ID}.png`])
  })
})
