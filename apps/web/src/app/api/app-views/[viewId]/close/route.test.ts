// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAuthContext, mockFindOpenAppView, mockReturning } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockFindOpenAppView: vi.fn(),
  mockReturning: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/apps/app-views', () => ({ findOpenAppView: mockFindOpenAppView }))
vi.mock('@cairn/db', () => ({
  appViews: { id: 'id', status: 'status', submittingUntil: 'submittingUntil' },
  db: {
    update: () => ({ set: () => ({ where: () => ({ returning: mockReturning }) }) }),
  },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
  lt: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}))

import { POST } from './route'

const VIEW_ID = '11111111-1111-4111-8111-111111111111'

describe('POST /api/app-views/[viewId]/close', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({ ctx: { userId: 'user-1', workspaceId: 'ws-1', role: 'viewer' }, error: null })
    mockFindOpenAppView.mockResolvedValue({ id: VIEW_ID })
    mockReturning.mockResolvedValue([{ id: VIEW_ID }])
  })

  it('member から閲覧のみ（viewer）に変わった人も、開いたままの自分のモーダルを閉じられる', async () => {
    const res = await POST(new Request('http://localhost'), { params: Promise.resolve({ viewId: VIEW_ID }) })

    expect(mockGetAuthContext).toHaveBeenCalledWith({ allowViewer: true })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
  })
})
