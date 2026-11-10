// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const MESSAGE_ID = '20000000-0000-0000-0000-000000000001'
const CHANNEL_ID = '40000000-0000-0000-0000-000000000001'
const PROJECT_ID = '50000000-0000-0000-0000-000000000001'
const IMAGE_A = '60000000-0000-0000-0000-00000000000a'
const IMAGE_B = '60000000-0000-0000-0000-00000000000b'
const NEW_FILE_ID = '70000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireChannelAccess,
  mockRequireProjectAccess,
  mockResolveUploadEntitlements,
  mockAssertOriginalStorageAllowed,
  mockRecordStorageUsageDelta,
  mockSelectResult,
  mockTxSelectResult,
  mockInsertValues,
  mockDownload,
  mockUpload,
  mockRemove,
  mockCreateDerived,
  mockReadCapture,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockRequireProjectAccess: vi.fn(),
  mockResolveUploadEntitlements: vi.fn(),
  mockAssertOriginalStorageAllowed: vi.fn(),
  mockRecordStorageUsageDelta: vi.fn(),
  // db.select の結果（呼び出し順に消費する）
  mockSelectResult: vi.fn(),
  // トランザクション内の重複確認の結果
  mockTxSelectResult: vi.fn(),
  mockInsertValues: vi.fn(),
  mockDownload: vi.fn(),
  mockUpload: vi.fn(),
  mockRemove: vi.fn(),
  mockCreateDerived: vi.fn(),
  mockReadCapture: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({
  requireChannelAccess: mockRequireChannelAccess,
  requireProjectAccess: mockRequireProjectAccess,
}))
vi.mock('@/lib/billing/entitlements', () => ({ resolveUploadEntitlements: mockResolveUploadEntitlements }))
vi.mock('@/lib/billing/original-storage', () => ({
  assertOriginalStorageAllowed: mockAssertOriginalStorageAllowed,
  ORIGINAL_UPLOAD_ENTITLEMENT_ERROR: 'original-upload-entitlement-required',
}))
vi.mock('@/lib/billing/storage-usage', () => ({ recordStorageUsageDelta: mockRecordStorageUsageDelta }))
vi.mock('@/lib/gallery-from-chat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/gallery-from-chat')>()),
  createGalleryDerivedImage: mockCreateDerived,
  readImageCaptureMetadata: mockReadCapture,
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: () => ({
    storage: {
      from: (bucket: string) => ({
        download: (path: string) => mockDownload(bucket, path),
        upload: (path: string, body: unknown, options: unknown) => mockUpload(bucket, path, body, options),
        remove: (paths: string[]) => mockRemove(bucket, paths),
      }),
    },
  }),
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  isNull: vi.fn(() => 'isNull'),
  inArray: vi.fn(() => 'inArray'),
  sql: vi.fn(() => 'sql'),
}))
vi.mock('@cairn/db', () => {
  const column = (name: string) => name
  const table = (name: string, columns: string[]) =>
    Object.fromEntries(columns.map(c => [c, column(`${name}.${c}`)]))
  // select の連鎖は、limit() か where() の await で結果を1つ取り出す
  const selectChain = (next: () => unknown) => {
    const chain: Record<string, unknown> = {}
    for (const method of ['from', 'innerJoin']) chain[method] = () => chain
    chain['where'] = () => ({
      limit: () => Promise.resolve(next()),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(next()).then(resolve, reject),
    })
    return chain
  }
  const insert = vi.fn((target: unknown) => ({
    values: (values: unknown) => {
      mockInsertValues(target, values)
      const result = Promise.resolve(undefined)
      return Object.assign(result, { returning: () => Promise.resolve([{ id: NEW_FILE_ID }]) })
    },
  }))
  const tx = {
    execute: vi.fn(() => Promise.resolve()),
    select: vi.fn(() => selectChain(() => mockTxSelectResult())),
    insert,
  }
  const db = {
    select: vi.fn(() => selectChain(() => mockSelectResult())),
    transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  }
  return {
    db,
    messages: table('messages', ['id', 'messageType', 'channelId', 'deletedAt']),
    channels: table('channels', ['id', 'workspaceId', 'projectId']),
    files: table('files', ['id', 'workspaceId', 'fileName', 'mimeType', 'storagePath']),
    galleryItems: table('galleryItems', ['id', 'projectId', 'metadata']),
    messageAttachments: table('messageAttachments', ['messageId', 'fileId']),
  }
})

const messageRow = { id: MESSAGE_ID, messageType: 'text', channelId: CHANNEL_ID, projectId: PROJECT_ID }
const imageRow = (fileId: string, overrides: Record<string, unknown> = {}) => ({
  fileId,
  fileName: `${fileId}.jpg`,
  mimeType: 'image/jpeg',
  storagePath: `${WORKSPACE_ID}/${CHANNEL_ID}/${USER_ID}/${fileId}.jpg`,
  ...overrides,
})

const routeParams = { params: Promise.resolve({ messageId: MESSAGE_ID }) }

async function callPost(body: unknown) {
  const { POST } = await import('./route')
  return POST(
    new Request(`http://localhost/api/messages/${MESSAGE_ID}/gallery`, { method: 'POST', body: JSON.stringify(body) }),
    routeParams,
  )
}

async function callGet() {
  const { GET } = await import('./route')
  return GET(new Request(`http://localhost/api/messages/${MESSAGE_ID}/gallery`), routeParams)
}

const insertedInto = (tableName: string) =>
  mockInsertValues.mock.calls
    .filter(([target]) => Object.values(target as Record<string, string>).some(c => c.startsWith(`${tableName}.`)))
    .map(([, values]) => values as Record<string, unknown>)

beforeEach(() => {
  mockGetAuthContext.mockResolvedValue({
    ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID, role: 'member' },
    error: null,
  })
  mockRequireChannelAccess.mockResolvedValue(null)
  mockRequireProjectAccess.mockResolvedValue(null)
  mockResolveUploadEntitlements.mockResolvedValue({ rights: { canUploadOriginal: true } })
  mockAssertOriginalStorageAllowed.mockResolvedValue(undefined)
  mockRecordStorageUsageDelta.mockResolvedValue(undefined)
  mockTxSelectResult.mockReturnValue([])
  // jsdom の Blob は arrayBuffer() を持たないため、Storage の download が返す形だけを用意する
  mockDownload.mockResolvedValue({
    data: { arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3, 4]).buffer) },
    error: null,
  })
  mockUpload.mockResolvedValue({ error: null })
  mockRemove.mockResolvedValue({ error: null })
  mockCreateDerived.mockResolvedValue(Buffer.from([9, 9]))
  mockReadCapture.mockResolvedValue({ takenAt: new Date('2026-08-01T03:00:00Z'), latitude: 35.6, longitude: 139.7 })
})

afterEach(() => {
  vi.clearAllMocks()
  mockSelectResult.mockReset()
})

describe('POST /api/messages/[messageId]/gallery', () => {
  it('プロジェクトのチャンネルでなければ 400 を返し、何もコピーしない', async () => {
    mockSelectResult.mockReturnValueOnce([{ ...messageRow, projectId: null }])

    const res = await callPost({ fileIds: [IMAGE_A] })

    expect(res.status).toBe(400)
    expect(mockDownload).not.toHaveBeenCalled()
  })

  it('チャンネルを見られない利用者には、チャンネルの権限エラーをそのまま返す', async () => {
    mockSelectResult.mockReturnValueOnce([messageRow])
    mockRequireChannelAccess.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))

    const res = await callPost({ fileIds: [IMAGE_A] })

    expect(res.status).toBe(403)
    expect(mockRequireProjectAccess).not.toHaveBeenCalled()
  })

  it('メッセージに無い添付を指定したら 404 を返す', async () => {
    mockSelectResult.mockReturnValueOnce([messageRow]).mockReturnValueOnce([imageRow(IMAGE_A)])

    const res = await callPost({ fileIds: [IMAGE_A, IMAGE_B] })

    expect(res.status).toBe(404)
    expect(mockDownload).not.toHaveBeenCalled()
  })

  it('画像以外の添付は 400 で断る', async () => {
    mockSelectResult
      .mockReturnValueOnce([messageRow])
      .mockReturnValueOnce([imageRow(IMAGE_A, { mimeType: 'application/pdf' })])

    const res = await callPost({ fileIds: [IMAGE_A] })

    expect(res.status).toBe(400)
  })

  it('原寸と圧縮版をギャラリーのバケットへコピーし、追加元を metadata に残す', async () => {
    mockSelectResult
      .mockReturnValueOnce([messageRow])
      .mockReturnValueOnce([imageRow(IMAGE_A)])
      .mockReturnValueOnce([])

    const res = await callPost({ fileIds: [IMAGE_A] })

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ projectId: PROJECT_ID, addedCount: 1, alreadyAddedCount: 0 })
    expect(mockDownload).toHaveBeenCalledWith('chat-attachments', imageRow(IMAGE_A).storagePath)
    const uploadedBuckets = mockUpload.mock.calls.map(([bucket]) => bucket).sort()
    expect(uploadedBuckets).toEqual(['gallery', 'gallery-originals'])
    expect(mockAssertOriginalStorageAllowed).toHaveBeenCalled()

    const [file] = insertedInto('files')
    expect(file).toMatchObject({ projectId: PROJECT_ID, fileType: 'image', fileSize: 4, derivedFileSize: 2 })
    expect(file?.['storagePath']).toMatch(new RegExp(`^${WORKSPACE_ID}/${PROJECT_ID}/original/`))
    const [item] = insertedInto('galleryItems')
    expect(item).toMatchObject({
      projectId: PROJECT_ID,
      fileId: NEW_FILE_ID,
      metadata: { sourceMessageId: MESSAGE_ID, sourceFileId: IMAGE_A },
      latitude: '35.6000000',
      longitude: '139.7000000',
    })
    expect(mockRecordStorageUsageDelta).toHaveBeenCalledWith(
      WORKSPACE_ID,
      { originalBytes: 4, derivedBytes: 2 },
      expect.anything(),
    )
    // 元のチャット添付は消さない
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('原本を保存する権利が無ければ、圧縮版だけを追加する（通常のギャラリーアップロードと同じ）', async () => {
    mockResolveUploadEntitlements.mockResolvedValue({ rights: { canUploadOriginal: false } })
    mockSelectResult
      .mockReturnValueOnce([messageRow])
      .mockReturnValueOnce([imageRow(IMAGE_A)])
      .mockReturnValueOnce([])

    const res = await callPost({ fileIds: [IMAGE_A] })

    expect(res.status).toBe(201)
    expect(mockUpload.mock.calls.map(([bucket]) => bucket)).toEqual(['gallery'])
    expect(mockAssertOriginalStorageAllowed).not.toHaveBeenCalled()
    expect(insertedInto('files')[0]).toMatchObject({ storagePath: null, fileSize: null, mimeType: 'image/webp' })
    expect(mockRecordStorageUsageDelta).toHaveBeenCalledWith(
      WORKSPACE_ID,
      { originalBytes: 0, derivedBytes: 2 },
      expect.anything(),
    )
  })

  it('追加済みの画像は読み込まずに数だけ返す', async () => {
    mockSelectResult
      .mockReturnValueOnce([messageRow])
      .mockReturnValueOnce([imageRow(IMAGE_A), imageRow(IMAGE_B)])
      .mockReturnValueOnce([{ sourceFileId: IMAGE_A }])

    const res = await callPost({ fileIds: [IMAGE_A, IMAGE_B] })

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ projectId: PROJECT_ID, addedCount: 1, alreadyAddedCount: 1 })
    expect(mockDownload).toHaveBeenCalledTimes(1)
    expect(mockDownload).toHaveBeenCalledWith('chat-attachments', imageRow(IMAGE_B).storagePath)
  })

  it('並行して先に追加されていたら、コピーした実体を消して追加済みとして数える', async () => {
    mockSelectResult
      .mockReturnValueOnce([messageRow])
      .mockReturnValueOnce([imageRow(IMAGE_A)])
      .mockReturnValueOnce([])
    mockTxSelectResult.mockReturnValue([{ id: 'existing' }])

    const res = await callPost({ fileIds: [IMAGE_A] })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ projectId: PROJECT_ID, addedCount: 0, alreadyAddedCount: 1 })
    expect(insertedInto('files')).toHaveLength(0)
    expect(mockRemove.mock.calls.map(([bucket]) => bucket).sort()).toEqual(['gallery', 'gallery-originals'])
  })

  it('確定直前に残高・支援が無くなっていたら 403 を返し、コピーした実体を消す', async () => {
    mockSelectResult
      .mockReturnValueOnce([messageRow])
      .mockReturnValueOnce([imageRow(IMAGE_A)])
      .mockReturnValueOnce([])
    mockAssertOriginalStorageAllowed.mockRejectedValue(new Error('original-upload-entitlement-required'))

    const res = await callPost({ fileIds: [IMAGE_A] })

    expect(res.status).toBe(403)
    expect(mockRemove).toHaveBeenCalled()
  })

  it('チャット添付の取得に失敗したら 500 を返し、ギャラリーには何も登録しない', async () => {
    mockSelectResult
      .mockReturnValueOnce([messageRow])
      .mockReturnValueOnce([imageRow(IMAGE_A)])
      .mockReturnValueOnce([])
    mockDownload.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const res = await callPost({ fileIds: [IMAGE_A] })

    expect(res.status).toBe(500)
    expect(insertedInto('files')).toHaveLength(0)
  })

  it('fileIds が空なら 400 を返す', async () => {
    mockSelectResult.mockReturnValueOnce([messageRow])

    const res = await callPost({ fileIds: [] })

    expect(res.status).toBe(400)
  })
})

describe('GET /api/messages/[messageId]/gallery', () => {
  it('このプロジェクトのギャラリーへ追加済みの添付を返す', async () => {
    mockSelectResult
      .mockReturnValueOnce([messageRow])
      .mockReturnValueOnce([{ fileId: IMAGE_A }, { fileId: IMAGE_A }])

    const res = await callGet()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ projectId: PROJECT_ID, addedFileIds: [IMAGE_A] })
  })

  it('プロジェクトに参加していなければ、プロジェクトの権限エラーを返す', async () => {
    mockSelectResult.mockReturnValueOnce([messageRow])
    mockRequireProjectAccess.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))

    const res = await callGet()

    expect(res.status).toBe(403)
  })
})
