// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const FILE_ID = '30000000-0000-0000-0000-000000000001'

const { chunkRows, fileRow, mockCanAccessFile, mockGetAuthContext, mockIsIndexable, mockSelect } =
  vi.hoisted(() => ({
    chunkRows: [] as Array<{ chunkIndex: number; content: string }>,
    fileRow: {
      id: '30000000-0000-0000-0000-000000000001',
      workspaceId: 'workspace-1',
      projectId: 'project-1' as string | null,
      uploadedBy: 'user-2',
      fileName: '仕様書.pdf',
      mimeType: 'application/pdf' as string | null,
      fileType: 'document',
      metadata: {},
    },
    mockCanAccessFile: vi.fn(),
    mockGetAuthContext: vi.fn(),
    mockIsIndexable: vi.fn(),
    mockSelect: vi.fn(),
  }))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ canAccessFile: mockCanAccessFile }))
vi.mock('@/lib/ai/extract-text', () => ({ isIndexable: mockIsIndexable }))

vi.mock('@cairn/db', () => {
  const fileBuilder = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(async () => [fileRow]),
  }
  const chunkBuilder = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn(async (limit: number) => chunkRows.slice(0, limit)),
  }

  mockSelect.mockImplementation((fields: Record<string, unknown>) =>
    'fileName' in fields ? fileBuilder : chunkBuilder,
  )

  return {
    db: { select: mockSelect },
    files: {
      id: 'files.id',
      workspaceId: 'files.workspaceId',
      projectId: 'files.projectId',
      uploadedBy: 'files.uploadedBy',
      fileName: 'files.fileName',
      mimeType: 'files.mimeType',
      fileType: 'files.fileType',
      metadata: 'files.metadata',
    },
    documentChunks: {
      sourceType: 'documentChunks.sourceType',
      sourceId: 'documentChunks.sourceId',
      chunkIndex: 'documentChunks.chunkIndex',
      content: 'documentChunks.content',
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  asc: vi.fn((value: unknown) => ({ asc: value })),
  eq: vi.fn((left: unknown, right: unknown) => ({ eq: [left, right] })),
  gte: vi.fn((left: unknown, right: unknown) => ({ gte: [left, right] })),
}))

import { GET } from './route'

function request(query = '') {
  return new Request(`http://localhost/api/files/${FILE_ID}/content${query}`)
}

function routeParams() {
  return { params: Promise.resolve({ id: FILE_ID }) }
}

describe('GET /api/files/[id]/content', () => {
  beforeEach(() => {
    chunkRows.splice(0)
    Object.assign(fileRow, {
      mimeType: 'application/pdf',
      fileType: 'document',
      metadata: {},
    })
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1', role: 'member' },
      error: null,
    })
    mockCanAccessFile.mockResolvedValue(true)
    mockIsIndexable.mockReturnValue(true)
    vi.clearAllMocks()
  })

  it('閲覧権限がないファイルの本文を返さない', async () => {
    mockCanAccessFile.mockResolvedValue(false)

    const response = await GET(request(), routeParams())

    expect(response.status).toBe(403)
    expect(mockCanAccessFile).toHaveBeenCalledWith(
      'workspace-1',
      'user-1',
      expect.objectContaining({ id: FILE_ID }),
      'member',
    )
  })

  it('抽出済み本文を指定数ずつ返し、続きのチャンク位置を示す', async () => {
    chunkRows.push(
      { chunkIndex: 0, content: '最初のチャンク' },
      { chunkIndex: 1, content: '次のチャンク' },
      { chunkIndex: 2, content: '続きのチャンク' },
    )

    const response = await GET(request('?limit=2'), routeParams())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      file: {
        id: FILE_ID,
        fileName: '仕様書.pdf',
        mimeType: 'application/pdf',
        fileType: 'document',
      },
      chunks: [
        { chunkIndex: 0, content: '最初のチャンク' },
        { chunkIndex: 1, content: '次のチャンク' },
      ],
      nextStartChunk: 2,
    })
  })

  it('対応形式が未インデックスなら処理中として返す', async () => {
    const response = await GET(request(), routeParams())

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'ファイル本文はまだインデックスされていません',
    })
  })

  it('テキスト抽出に未対応の形式を明示する', async () => {
    fileRow.mimeType = 'image/png'
    mockIsIndexable.mockReturnValue(false)

    const response = await GET(request(), routeParams())

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({
      error: 'このファイル形式はテキスト抽出に対応していません',
    })
  })

  it('一度に11チャンク以上の取得を拒否する', async () => {
    const response = await GET(request('?limit=11'), routeParams())

    expect(response.status).toBe(422)
    expect(mockSelect).not.toHaveBeenCalled()
  })
})
