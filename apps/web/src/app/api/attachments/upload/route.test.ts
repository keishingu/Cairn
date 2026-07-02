// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const CHANNEL_ID = '20000000-0000-0000-0000-000000000001'

const { mockGetAuthContext, mockRequireChannelAccess, mockUpload, mockIsIndexable, mockInngestSend, mockInsertValues } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockUpload: vi.fn().mockResolvedValue({ error: null }),
  mockIsIndexable: vi.fn(),
  mockInngestSend: vi.fn().mockResolvedValue(undefined),
  mockInsertValues: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireChannelAccess: mockRequireChannelAccess }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: () => ({
    storage: { from: () => ({ upload: mockUpload, remove: vi.fn() }) },
  }),
}))
vi.mock('@/lib/ai/extract-text', () => ({ isIndexable: mockIsIndexable }))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: mockInngestSend } }))
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
      values: (v: Record<string, unknown>) => ({
        returning: vi.fn().mockImplementation(async () => {
          mockInsertValues(v)
          return [{ id: 'file-1', ...v }]
        }),
      }),
    }),
  },
  files: {},
  channels: { projectId: 'c.projectId', id: 'c.id' },
}))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => 'eq') }))

// jsdom の File/Blob には arrayBuffer() が実装されていないため、
// route.ts の file.arrayBuffer() 呼び出しに対応できるようパッチしたFileを用意する。
// FormData.set(name, file) にfilename引数を渡すと別インスタンスにラップされ
// パッチが失われるため、name引数のみで渡す(fileは既にnameを持つ)。
function makeFile(name: string, type: string, content: string): File {
  const file = new File([content], name, { type })
  Object.assign(file, {
    arrayBuffer: async () => new TextEncoder().encode(content).buffer,
  })
  return file
}

describe('/api/attachments/upload のアクセス制御', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('アクセス権の無いチャンネルへはアップロードできない', async () => {
    mockRequireChannelAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    )

    const formData = new FormData()
    formData.set('channelId', CHANNEL_ID)
    formData.set('file', new Blob(['hello'], { type: 'text/plain' }), 'hello.txt')

    const { POST } = await import('./route')
    const res = await POST({ formData: () => Promise.resolve(formData) } as Request)

    expect(res.status).toBe(403)
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(DEV_WORKSPACE_ID, DEV_USER_ID, CHANNEL_ID)
  })
})

describe('/api/attachments/upload のCSV MIMEタイプ正規化', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
    mockIsIndexable.mockReturnValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('拡張子が.csvでブラウザがapplication/vnd.ms-excelと報告した場合、text/csvとして保存・検索インデックス化する', async () => {
    const formData = new FormData()
    formData.set('channelId', CHANNEL_ID)
    formData.set('file', makeFile('data.csv', 'application/vnd.ms-excel', 'a,b\n1,2'))

    const { POST } = await import('./route')
    const res = await POST({ formData: () => Promise.resolve(formData) } as Request)

    expect(res.status).toBe(201)
    const body = await res.json() as { mimeType: string }
    expect(body.mimeType).toBe('text/csv')
    expect(mockUpload).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ contentType: 'text/csv' }),
    )
    expect(mockIsIndexable).toHaveBeenCalledWith('text/csv')
    expect(mockInngestSend).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ mimeType: 'text/csv' }),
    }))
    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { pendingChannelId: CHANNEL_ID },
    }))
  })

  it('拡張子が.csvでformData経由でapplication/octet-streamと報告された場合も、text/csvとして保存・検索インデックス化する', async () => {
    const formData = new FormData()
    formData.set('channelId', CHANNEL_ID)
    formData.set('file', makeFile('data.csv', 'application/octet-stream', 'a,b\n1,2'))

    const { POST } = await import('./route')
    const res = await POST({ formData: () => Promise.resolve(formData) } as Request)

    expect(res.status).toBe(201)
    const body = await res.json() as { mimeType: string }
    expect(body.mimeType).toBe('text/csv')
  })

  it('拡張子が.xlsのapplication/vnd.ms-excelは正規化せずそのまま扱う', async () => {
    const formData = new FormData()
    formData.set('channelId', CHANNEL_ID)
    formData.set('file', makeFile('data.xls', 'application/vnd.ms-excel', 'dummy'))

    const { POST } = await import('./route')
    const res = await POST({ formData: () => Promise.resolve(formData) } as Request)

    expect(res.status).toBe(201)
    const body = await res.json() as { mimeType: string }
    expect(body.mimeType).toBe('application/vnd.ms-excel')
  })
})
