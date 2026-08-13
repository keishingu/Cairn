// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const CHANNEL_ID = '20000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireChannelAccess,
  mockResolveUploadEntitlements,
  mockList,
  mockRemove,
  mockIsIndexable,
  mockInngestSend,
  mockCreateThumbnailFromStorage,
  mockIsBillingEnabled,
  mockInsertValues,
  mockInsertReturning,
  mockRecordStorageUsageDelta,
  mockSelectLimit,
  mockTransactionSelectLimit,
  mockTransactionExecute,
  mockDeleteWhere,
  mockHasAttachmentUploadRequestSchema,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockResolveUploadEntitlements: vi.fn(),
  mockList: vi.fn(),
  mockRemove: vi.fn().mockResolvedValue({ error: null }),
  mockIsIndexable: vi.fn(),
  mockInngestSend: vi.fn().mockResolvedValue(undefined),
  mockCreateThumbnailFromStorage: vi.fn(),
  mockIsBillingEnabled: vi.fn(() => false),
  mockRecordStorageUsageDelta: vi.fn().mockResolvedValue(undefined),
  mockSelectLimit: vi.fn(),
  mockInsertReturning: vi.fn(),
  mockTransactionSelectLimit: vi.fn(),
  mockTransactionExecute: vi.fn().mockResolvedValue({
    rows: [
      {
        id: 'upload-1',
        expires_at: new Date('2099-01-01T00:00:00Z'),
        finalized_at: null,
        file_id: null,
      },
    ],
  }),
  mockDeleteWhere: vi.fn().mockResolvedValue(undefined),
  mockHasAttachmentUploadRequestSchema: vi.fn().mockResolvedValue(true),
  mockInsertValues: vi.fn((v: Record<string, unknown>) => ({
    onConflictDoNothing: () => ({ returning: () => mockInsertReturning(v) }),
  })),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireChannelAccess: mockRequireChannelAccess }))
vi.mock('@/lib/billing/entitlements', () => ({
  resolveUploadEntitlements: mockResolveUploadEntitlements,
}))
vi.mock('@/lib/billing/is-billing-enabled', () => ({ isBillingEnabled: mockIsBillingEnabled }))
vi.mock('@/lib/billing/storage-rent', () => ({
  settleWorkspaceStorageRent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: () => ({
    storage: { from: () => ({ list: mockList, remove: mockRemove }) },
  }),
}))
vi.mock('@/lib/ai/extract-text', () => ({ isIndexable: mockIsIndexable }))
vi.mock('@/lib/attachments/thumbnail', () => ({
  ATTACHMENTS_BUCKET: 'chat-attachments',
  createThumbnailFromStorage: mockCreateThumbnailFromStorage,
}))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: mockInngestSend } }))
vi.mock('@/lib/billing/storage-usage', () => ({
  recordStorageUsageDelta: mockRecordStorageUsageDelta,
}))
vi.mock('@/lib/uploads/schema-readiness', () => ({
  hasAttachmentUploadRequestSchema: mockHasAttachmentUploadRequestSchema,
}))
vi.mock('@cairn/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockSelectLimit,
        }),
      }),
    }),
    insert: () => ({
      values: mockInsertValues,
    }),
    transaction: async (
      callback: (tx: {
        execute: () => Promise<void>
        insert: () => { values: typeof mockInsertValues }
        update: () => { set: () => { where: () => Promise<void> } }
        delete: () => { where: () => Promise<void> }
        select: () => {
          from: () => {
            where: () => {
              for: () => { limit: typeof mockTransactionSelectLimit }
              limit: typeof mockTransactionSelectLimit
            }
          }
        }
      }) => unknown,
    ) =>
      callback({
        execute: mockTransactionExecute,
        insert: () => ({ values: mockInsertValues }),
        update: () => ({ set: () => ({ where: vi.fn().mockResolvedValue(undefined) }) }),
        delete: () => ({ where: mockDeleteWhere }),
        select: () => ({
          from: () => ({
            where: () => {
              const query = {
                for: () => ({ limit: mockTransactionSelectLimit }),
                limit: mockTransactionSelectLimit,
                then: (
                  onfulfilled: (value: unknown) => unknown,
                  onrejected: (reason: unknown) => unknown,
                ) => Promise.resolve(mockTransactionSelectLimit()).then(onfulfilled, onrejected),
              }
              return query
            },
          }),
        }),
      }),
  },
  files: {},
  creditLedger: {},
  subscriptions: {},
  workspaceStorageUsage: {},
  channels: { projectId: 'c.projectId', id: 'c.id' },
  uploadRequests: {},
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  gt: vi.fn(() => 'gt'),
  isNull: vi.fn(() => 'isNull'),
  sql: vi.fn(() => 'sql'),
}))

function post(body: unknown): Request {
  return { json: () => Promise.resolve(body) } as Request
}

function storagePathFor(name: string): string {
  return `${DEV_WORKSPACE_ID}/${CHANNEL_ID}/${DEV_USER_ID}/${name}`
}

describe('/api/attachments/finalize のアクセス制御', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockList.mockResolvedValue({ data: [{ name: 'x.pdf', metadata: { size: 100 } }], error: null })
    mockResolveUploadEntitlements.mockResolvedValue({ rights: { canUploadOriginal: true } })
    mockSelectLimit
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'upload-1' }])
      .mockResolvedValueOnce([{ projectId: null }])
    mockInsertReturning.mockImplementation((values) =>
      Promise.resolve([{ id: 'file-1', ...values }]),
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('アクセス権の無いチャンネルへは登録できない', async () => {
    mockRequireChannelAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    )

    const { POST } = await import('./route')
    const res = await POST(
      post({
        channelId: CHANNEL_ID,
        storagePath: storagePathFor('x.pdf'),
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
        fileSize: 100,
      }),
    )

    expect(res.status).toBe(403)
  })

  it('他ワークスペースを指す storagePath は拒否する', async () => {
    mockRequireChannelAccess.mockResolvedValue(null)

    const { POST } = await import('./route')
    const res = await POST(
      post({
        channelId: CHANNEL_ID,
        storagePath: `99999999-0000-0000-0000-000000000009/${CHANNEL_ID}/x.pdf`,
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
        fileSize: 100,
      }),
    )

    expect(res.status).toBe(400)
  })

  it('アップロードされたオブジェクトが存在しない場合は拒否する', async () => {
    mockRequireChannelAccess.mockResolvedValue(null)
    mockList.mockResolvedValue({ data: [], error: null })

    const { POST } = await import('./route')
    const res = await POST(
      post({
        channelId: CHANNEL_ID,
        storagePath: storagePathFor('x.pdf'),
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
        fileSize: 100,
      }),
    )

    expect(res.status).toBe(400)
  })

  it('清掃と競合してintentが期限切れならファイルを確定しない', async () => {
    mockRequireChannelAccess.mockResolvedValue(null)
    mockTransactionSelectLimit.mockResolvedValue([])
    mockTransactionExecute.mockResolvedValueOnce({
      rows: [
        {
          id: 'upload-1',
          expires_at: new Date('2000-01-01T00:00:00Z'),
          finalized_at: null,
          file_id: null,
        },
      ],
    })

    const { POST } = await import('./route')
    const res = await POST(
      post({
        channelId: CHANNEL_ID,
        storagePath: storagePathFor('x.pdf'),
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
        fileSize: 100,
      }),
    )

    expect(res.status).toBe(410)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('原本保存の権利を失った場合はオブジェクトを削除して登録しない', async () => {
    mockRequireChannelAccess.mockResolvedValue(null)
    mockResolveUploadEntitlements.mockResolvedValue({ rights: { canUploadLargeFile: false } })
    mockList.mockResolvedValue({
      data: [{ name: 'x.pdf', metadata: { size: 6 * 1024 * 1024 } }],
      error: null,
    })
    mockTransactionSelectLimit.mockResolvedValue([])

    const { POST } = await import('./route')
    const res = await POST(
      post({
        channelId: CHANNEL_ID,
        storagePath: storagePathFor('x.pdf'),
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
        fileSize: 100,
      }),
    )

    expect(res.status).toBe(403)
    expect(mockRemove).toHaveBeenCalledWith([storagePathFor('x.pdf')])
    expect(mockDeleteWhere).not.toHaveBeenCalled()
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('無料容量を超える小容量ファイルは最終確定時に支援なしで拒否する', async () => {
    const { BILLING_CONFIG } = await import('@cairn/core/billing')
    mockIsBillingEnabled.mockReturnValue(true)
    mockRequireChannelAccess.mockResolvedValue(null)
    mockList.mockResolvedValue({ data: [{ name: 'x.pdf', metadata: { size: 100 } }], error: null })
    mockSelectLimit
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'upload-1' }])
      .mockResolvedValueOnce([{ projectId: null }])
    mockTransactionSelectLimit
      .mockResolvedValueOnce([{ originalBytes: BILLING_CONFIG.freeStorageBytes }])
      .mockResolvedValueOnce([{ balance: '0' }])
      .mockResolvedValueOnce([])

    const { POST } = await import('./route')
    const res = await POST(
      post({
        channelId: CHANNEL_ID,
        storagePath: storagePathFor('x.pdf'),
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
        fileSize: 100,
      }),
    )

    expect(res.status).toBe(403)
    expect(mockRemove).toHaveBeenCalledWith([storagePathFor('x.pdf')])
    expect(mockInsertReturning).not.toHaveBeenCalled()
  })
})

describe('/api/attachments/finalize のCSV MIMEタイプ正規化', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
    mockResolveUploadEntitlements.mockResolvedValue({ rights: { canUploadOriginal: true } })
    mockSelectLimit
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'upload-1' }])
      .mockResolvedValueOnce([{ projectId: null }])
    mockIsIndexable.mockReturnValue(true)
    mockCreateThumbnailFromStorage.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('拡張子が.csvでブラウザがapplication/vnd.ms-excelと報告した場合、text/csvとして保存・検索インデックス化する', async () => {
    mockList.mockResolvedValue({ data: [{ name: 'data.csv', metadata: { size: 6 } }], error: null })

    const { POST } = await import('./route')
    const res = await POST(
      post({
        channelId: CHANNEL_ID,
        storagePath: storagePathFor('data.csv'),
        fileName: 'data.csv',
        mimeType: 'application/vnd.ms-excel',
        fileSize: 6,
      }),
    )

    expect(res.status).toBe(201)
    const body = (await res.json()) as { mimeType: string; fileSize: number }
    expect(body.mimeType).toBe('text/csv')
    // Storage 上の権威あるサイズを採用する
    expect(body.fileSize).toBe(6)
    expect(mockIsIndexable).toHaveBeenCalledWith('text/csv')
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mimeType: 'text/csv' }),
      }),
    )
  })

  it('拡張子が.xlsのapplication/vnd.ms-excelは正規化せずそのまま扱う', async () => {
    mockList.mockResolvedValue({ data: [{ name: 'data.xls', metadata: { size: 5 } }], error: null })

    const { POST } = await import('./route')
    const res = await POST(
      post({
        channelId: CHANNEL_ID,
        storagePath: storagePathFor('data.xls'),
        fileName: 'data.xls',
        mimeType: 'application/vnd.ms-excel',
        fileSize: 5,
      }),
    )

    expect(res.status).toBe(201)
    const body = (await res.json()) as { mimeType: string }
    expect(body.mimeType).toBe('application/vnd.ms-excel')
  })

  it('画像ファイルはサムネイルを生成して metadata に保存する', async () => {
    mockList.mockResolvedValue({
      data: [{ name: 'image.png', metadata: { size: 1000 } }],
      error: null,
    })
    mockIsIndexable.mockReturnValue(false)
    mockCreateThumbnailFromStorage.mockResolvedValue(
      `${DEV_WORKSPACE_ID}/${CHANNEL_ID}/thumb/image.jpg`,
    )

    const { POST } = await import('./route')
    const res = await POST(
      post({
        channelId: CHANNEL_ID,
        storagePath: storagePathFor('image.png'),
        fileName: 'image.png',
        mimeType: 'image/png',
        fileSize: 1000,
      }),
    )

    expect(res.status).toBe(201)
    expect(mockCreateThumbnailFromStorage).toHaveBeenCalledWith(
      expect.any(Object),
      storagePathFor('image.png'),
    )
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { thumbnailPath: `${DEV_WORKSPACE_ID}/${CHANNEL_ID}/thumb/image.jpg` },
      }),
    )
  })

  it('同じstoragePathの再試行は既存ファイルを返し、使用量と索引を重複させない', async () => {
    mockList.mockResolvedValue({ data: [{ name: 'x.pdf', metadata: { size: 100 } }], error: null })
    mockIsIndexable.mockReturnValue(true)
    mockInsertReturning.mockResolvedValue([])
    mockTransactionSelectLimit.mockResolvedValue([
      { id: 'file-existing', fileName: 'x.pdf', mimeType: 'application/pdf', fileSize: 100 },
    ])

    const { POST } = await import('./route')
    const res = await POST(
      post({
        channelId: CHANNEL_ID,
        storagePath: storagePathFor('x.pdf'),
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
        fileSize: 100,
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ fileId: 'file-existing' })
    expect(mockRecordStorageUsageDelta).not.toHaveBeenCalled()
    expect(mockInngestSend).not.toHaveBeenCalled()
  })
})
