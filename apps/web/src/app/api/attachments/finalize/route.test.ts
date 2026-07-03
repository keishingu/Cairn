// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const CHANNEL_ID = '20000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireChannelAccess,
  mockList,
  mockRemove,
  mockCreateThumbnailFromStorage,
  mockInsertValues,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockList: vi.fn(),
  mockRemove: vi.fn().mockResolvedValue({ error: null }),
  mockCreateThumbnailFromStorage: vi.fn(),
  mockInsertValues: vi.fn((v: Record<string, unknown>) => ({
    returning: vi.fn().mockResolvedValue([{ id: 'file-1', ...v }]),
  })),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireChannelAccess: mockRequireChannelAccess }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: () => ({
    storage: { from: () => ({ list: mockList, remove: mockRemove }) },
  }),
}))
vi.mock('@/lib/attachments/thumbnail', () => ({ createThumbnailFromStorage: mockCreateThumbnailFromStorage }))
vi.mock('@cairn/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: vi.fn().mockResolvedValue([{ projectId: null }]),
        }),
      }),
    }),
    insert: () => ({
      values: mockInsertValues,
    }),
  },
  files: {},
  channels: { projectId: 'c.projectId', id: 'c.id' },
}))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => 'eq') }))

function post(body: unknown): Request {
  return { json: () => Promise.resolve(body) } as Request
}

function storagePathFor(name: string): string {
  return `${DEV_WORKSPACE_ID}/${CHANNEL_ID}/${name}`
}

describe('/api/attachments/finalize のアクセス制御', () => {
  beforeEach(() => {
    mockInsertValues.mockReset()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockList.mockResolvedValue({ data: [{ name: 'x.pdf', metadata: { size: 100 } }], error: null })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('アクセス権の無いチャンネルへは登録できない', async () => {
    mockRequireChannelAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    )

    const { POST } = await import('./route')
    const res = await POST(post({
      channelId: CHANNEL_ID,
      storagePath: storagePathFor('x.pdf'),
      fileName: 'x.pdf',
      mimeType: 'application/pdf',
      fileSize: 100,
    }))

    expect(res.status).toBe(403)
  })

  it('他ワークスペースを指す storagePath は拒否する', async () => {
    mockRequireChannelAccess.mockResolvedValue(null)

    const { POST } = await import('./route')
    const res = await POST(post({
      channelId: CHANNEL_ID,
      storagePath: `99999999-0000-0000-0000-000000000009/${CHANNEL_ID}/x.pdf`,
      fileName: 'x.pdf',
      mimeType: 'application/pdf',
      fileSize: 100,
    }))

    expect(res.status).toBe(400)
  })

  it('アップロードされたオブジェクトが存在しない場合は拒否する', async () => {
    mockRequireChannelAccess.mockResolvedValue(null)
    mockList.mockResolvedValue({ data: [], error: null })

    const { POST } = await import('./route')
    const res = await POST(post({
      channelId: CHANNEL_ID,
      storagePath: storagePathFor('x.pdf'),
      fileName: 'x.pdf',
      mimeType: 'application/pdf',
      fileSize: 100,
    }))

    expect(res.status).toBe(400)
  })

  it('workspace channel の仮添付には pendingChannelId を保存する', async () => {
    mockRequireChannelAccess.mockResolvedValue(null)

    const { POST } = await import('./route')
    const res = await POST(post({
      channelId: CHANNEL_ID,
      storagePath: storagePathFor('x.pdf'),
      fileName: 'x.pdf',
      mimeType: 'application/pdf',
      fileSize: 100,
    }))

    expect(res.status).toBe(201)
    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { pendingChannelId: CHANNEL_ID },
    }))
  })
})

describe('/api/attachments/finalize のCSV MIMEタイプ正規化', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
    mockCreateThumbnailFromStorage.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('拡張子が.csvでブラウザがapplication/vnd.ms-excelと報告した場合、text/csvとして保存する', async () => {
    mockList.mockResolvedValue({ data: [{ name: 'data.csv', metadata: { size: 6 } }], error: null })

    const { POST } = await import('./route')
    const res = await POST(post({
      channelId: CHANNEL_ID,
      storagePath: storagePathFor('data.csv'),
      fileName: 'data.csv',
      mimeType: 'application/vnd.ms-excel',
      fileSize: 6,
    }))

    expect(res.status).toBe(201)
    const body = await res.json() as { mimeType: string; fileSize: number }
    expect(body.mimeType).toBe('text/csv')
    // Storage 上の権威あるサイズを採用する
    expect(body.fileSize).toBe(6)
  })

  it('拡張子が.xlsのapplication/vnd.ms-excelは正規化せずそのまま扱う', async () => {
    mockList.mockResolvedValue({ data: [{ name: 'data.xls', metadata: { size: 5 } }], error: null })

    const { POST } = await import('./route')
    const res = await POST(post({
      channelId: CHANNEL_ID,
      storagePath: storagePathFor('data.xls'),
      fileName: 'data.xls',
      mimeType: 'application/vnd.ms-excel',
      fileSize: 5,
    }))

    expect(res.status).toBe(201)
    const body = await res.json() as { mimeType: string }
    expect(body.mimeType).toBe('application/vnd.ms-excel')
  })

  it('画像ファイルはサムネイルを生成して metadata に保存する', async () => {
    mockList.mockResolvedValue({ data: [{ name: 'image.png', metadata: { size: 1000 } }], error: null })
    mockCreateThumbnailFromStorage.mockResolvedValue(`${DEV_WORKSPACE_ID}/${CHANNEL_ID}/thumb/image.jpg`)

    const { POST } = await import('./route')
    const res = await POST(post({
      channelId: CHANNEL_ID,
      storagePath: storagePathFor('image.png'),
      fileName: 'image.png',
      mimeType: 'image/png',
      fileSize: 1000,
    }))

    expect(res.status).toBe(201)
    expect(mockCreateThumbnailFromStorage).toHaveBeenCalledWith(expect.any(Object), storagePathFor('image.png'))
    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      metadata: {
        pendingChannelId: CHANNEL_ID,
        thumbnailPath: `${DEV_WORKSPACE_ID}/${CHANNEL_ID}/thumb/image.jpg`,
      },
    }))
  })
})
