// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const PROJECT_ID = '30000000-0000-0000-0000-000000000001'
const ITEM_ID = '40000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireProjectAccess,
  mockResolveUploadEntitlements,
  mockSelectLimit,
  mockDownload,
  mockCreateSignedUrl,
  mockFrom,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireProjectAccess: vi.fn(),
  mockResolveUploadEntitlements: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockDownload: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireProjectAccess: mockRequireProjectAccess }))
vi.mock('@/lib/billing/entitlements', () => ({
  resolveUploadEntitlements: mockResolveUploadEntitlements,
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: () => ({
    storage: {
      from: (bucket: string) => {
        mockFrom(bucket)
        return { download: mockDownload, createSignedUrl: mockCreateSignedUrl }
      },
    },
  }),
}))
vi.mock('@cairn/db', () => {
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit: mockSelectLimit,
  }
  return { db: { select: () => builder }, files: {}, galleryItems: {}, projects: {} }
})
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn() }))

const params = { params: Promise.resolve({ id: PROJECT_ID, itemId: ITEM_ID }) }

function withOriginal() {
  mockSelectLimit.mockReset().mockResolvedValueOnce([{ id: PROJECT_ID }]).mockResolvedValueOnce([
    {
      fileName: 'IMG_0001.JPG',
      storagePath: 'ws/p/original/a.jpg',
      derivedStoragePath: 'ws/p/derived/a.webp',
      mimeType: 'image/jpeg',
      derivedMimeType: 'image/webp',
    },
  ])
}

describe('/api/projects/[id]/gallery/[itemId]/file', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID, role: 'member' },
      error: null,
    })
    mockRequireProjectAccess.mockResolvedValue(null)
    mockDownload.mockResolvedValue({ data: new Blob(['x']), error: null })
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage.test/o' }, error: null })
    withOriginal()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('表示は支援状態を問わず圧縮版を返し、原本バケットに触れない', async () => {
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/'), params)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/webp')
    expect(mockDownload).toHaveBeenCalledWith('ws/p/derived/a.webp')
    expect(mockFrom).not.toHaveBeenCalledWith('gallery-originals')
    expect(mockResolveUploadEntitlements).not.toHaveBeenCalled()
  })

  it('Solo 支援者本人は原本をダウンロード名つきの短期署名URLで取得する', async () => {
    mockResolveUploadEntitlements.mockResolvedValue({ rights: { canDownloadOriginal: true } })
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/?original=1'), params)

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://storage.test/o')
    expect(mockFrom).toHaveBeenCalledWith('gallery-originals')
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('ws/p/original/a.jpg', 60, {
      download: 'IMG_0001.JPG',
    })
  })

  it('支援者本人でなければ残高があっても原本を渡さない', async () => {
    mockResolveUploadEntitlements.mockResolvedValue({ rights: { canDownloadOriginal: false } })
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/?original=1'), params)

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'original-download-entitlement-required' })
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('原本の無い写真は圧縮版を原本として渡さず404を返す', async () => {
    mockResolveUploadEntitlements.mockResolvedValue({ rights: { canDownloadOriginal: true } })
    mockSelectLimit.mockReset().mockResolvedValueOnce([{ id: PROJECT_ID }]).mockResolvedValueOnce([
      {
        fileName: 'a.jpg',
        storagePath: null,
        derivedStoragePath: 'ws/p/derived/a.webp',
        mimeType: 'image/webp',
        derivedMimeType: 'image/webp',
      },
    ])
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/?original=1'), params)

    expect(res.status).toBe(404)
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('プロジェクトにアクセスできなければ取得できない', async () => {
    mockRequireProjectAccess.mockResolvedValue(new Response(null, { status: 403 }))
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/?original=1'), params)

    expect(res.status).toBe(403)
    expect(mockDownload).not.toHaveBeenCalled()
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })
})
