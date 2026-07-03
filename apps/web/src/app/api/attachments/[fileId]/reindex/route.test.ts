// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const USER_ID = '00000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockDbSelect,
  mockDbDeleteWhere,
  mockDbUpdateWhere,
  mockEq,
  mockAnd,
  mockIsIndexable,
  mockInngestSend,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbDeleteWhere: vi.fn(),
  mockDbUpdateWhere: vi.fn(),
  mockEq: vi.fn(() => Symbol('eq')),
  mockAnd: vi.fn(() => Symbol('and')),
  mockIsIndexable: vi.fn(),
  mockInngestSend: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/ai/extract-text', () => ({ isIndexable: mockIsIndexable }))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: mockInngestSend } }))
vi.mock('@cairn/db', () => ({
  db: {
    select: mockDbSelect,
    delete: () => ({ where: mockDbDeleteWhere }),
    update: () => ({ set: () => ({ where: mockDbUpdateWhere }) }),
  },
  files: {
    id: 'files.id',
    workspaceId: 'files.workspaceId',
    storagePath: 'files.storagePath',
    mimeType: 'files.mimeType',
    metadata: 'files.metadata',
  },
  documentChunks: { sourceType: 'documentChunks.sourceType', sourceId: 'documentChunks.sourceId' },
}))
vi.mock('drizzle-orm', () => ({ eq: mockEq, and: mockAnd }))

function routeContext(fileId = 'file-1') {
  return { params: Promise.resolve({ fileId }) }
}

function mockSelectedFile(file: Record<string, unknown> | undefined) {
  mockDbSelect.mockImplementation(() => ({
    from() {
      return this
    },
    where() {
      return this
    },
    limit() {
      return Promise.resolve(file ? [file] : [])
    },
  }))
}

describe('/api/attachments/[fileId]/reindex', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({ ctx: { workspaceId: WORKSPACE_ID, userId: USER_ID }, error: null })
    mockIsIndexable.mockReturnValue(true)
    mockDbDeleteWhere.mockResolvedValue(undefined)
    mockDbUpdateWhere.mockResolvedValue(undefined)
    mockInngestSend.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('pending 添付は再インデックスを拒否する', async () => {
    mockSelectedFile({
      id: 'file-pending',
      workspaceId: WORKSPACE_ID,
      storagePath: 'chat/file.pdf',
      mimeType: 'application/pdf',
      metadata: { pendingChannelId: 'channel-1' },
    })

    const { POST } = await import('./route')
    const res = await POST(new Request('http://localhost'), routeContext())

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({ error: '未送信の添付は再インデックスできません' })
    expect(mockDbDeleteWhere).not.toHaveBeenCalled()
    expect(mockDbUpdateWhere).not.toHaveBeenCalled()
    expect(mockInngestSend).not.toHaveBeenCalled()
  })
})
