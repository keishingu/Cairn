// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PROJECT_ID = '30000000-0000-0000-0000-000000000001'

const { mockGetAuthContext, mockRequireProjectAccess, mockResolveUploadEntitlements, mockLimit, mockOrderBy } =
  vi.hoisted(() => ({
    mockGetAuthContext: vi.fn(),
    mockRequireProjectAccess: vi.fn(),
    mockResolveUploadEntitlements: vi.fn(),
    mockLimit: vi.fn(),
    mockOrderBy: vi.fn(),
  }))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireProjectAccess: mockRequireProjectAccess }))
vi.mock('@/lib/billing/entitlements', () => ({
  resolveUploadEntitlements: mockResolveUploadEntitlements,
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: () => ({
    storage: {
      from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }) }),
    },
  }),
}))
vi.mock('@cairn/db', () => {
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit: mockLimit,
    orderBy: mockOrderBy,
  }
  return { db: { select: () => builder }, files: {}, galleryItems: {}, projects: {} }
})
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn(), desc: vi.fn(), sql: vi.fn() }))

const params = { params: Promise.resolve({ id: PROJECT_ID }) }
const createdAt = new Date('2026-11-01T00:00:00Z')

describe('/api/projects/[id]/gallery GET', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'u1', workspaceId: 'w1', role: 'member' },
      error: null,
    })
    mockRequireProjectAccess.mockResolvedValue(null)
    mockLimit.mockResolvedValue([{ id: PROJECT_ID }])
    mockOrderBy.mockResolvedValue([
      { id: 'with-original', fileId: 'f1', fileName: 'a.jpg', storagePath: 'o/a.jpg', derivedStoragePath: 'd/a.webp', takenAt: null, createdAt },
      { id: 'derived-only', fileId: 'f2', fileName: 'b.jpg', storagePath: null, derivedStoragePath: 'd/b.webp', takenAt: null, createdAt },
      { id: 'legacy', fileId: 'f3', fileName: 'c.jpg', storagePath: 'legacy/c.jpg', derivedStoragePath: null, takenAt: null, createdAt },
    ])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('Solo 支援者本人には原本のある写真だけ原本のダウンロード先を返し、表示は圧縮版にする', async () => {
    mockResolveUploadEntitlements.mockResolvedValue({ rights: { canDownloadOriginal: true } })
    const { GET } = await import('./route')
    const items = (await (await GET(new Request('http://localhost/'), params)).json()) as Array<{
      id: string
      publicUrl: string
      originalDownloadUrl: string | null
    }>

    expect(items.map((i) => [i.id, i.originalDownloadUrl])).toEqual([
      ['with-original', `/api/projects/${PROJECT_ID}/gallery/with-original/file?original=1`],
      ['derived-only', null],
      ['legacy', null],
    ])
    expect(items[0]!.publicUrl).toBe('https://cdn.test/d/a.webp')
  })

  it('支援者本人でなければ原本のダウンロード先を返さない', async () => {
    mockResolveUploadEntitlements.mockResolvedValue({ rights: { canDownloadOriginal: false } })
    const { GET } = await import('./route')
    const items = (await (await GET(new Request('http://localhost/'), params)).json()) as Array<{
      originalDownloadUrl: string | null
    }>

    expect(items.every((i) => i.originalDownloadUrl === null)).toBe(true)
  })
})
