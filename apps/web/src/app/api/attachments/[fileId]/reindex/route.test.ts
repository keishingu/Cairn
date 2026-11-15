// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, test, vi } from 'vitest'

const { auth, access, deleteWhere, updateSet, send, isIndexable, rows, file } = vi.hoisted(() => ({
  auth: vi.fn(), access: vi.fn(), deleteWhere: vi.fn(), updateSet: vi.fn(), send: vi.fn(), isIndexable: vi.fn(), rows: [] as unknown[],
  file: { id: 'file', workspaceId: 'workspace', projectId: 'private-project', uploadedBy: 'other', metadata: {}, storagePath: 'path', mimeType: 'application/pdf' },
}))
vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: auth }))
vi.mock('@/lib/permissions', () => ({ canAccessFile: access }))
vi.mock('@/lib/ai/extract-text', () => ({ isIndexable }))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send } }))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn(), sql: vi.fn() }))
vi.mock('@cairn/db', () => {
  const query = { from: () => query, where: () => query, limit: async () => rows }
  return { db: { select: () => query, delete: () => ({ where: deleteWhere }), update: () => ({ set: updateSet }) }, files: {}, documentChunks: {} }
})

const params = { params: Promise.resolve({ fileId: 'file' }) }

describe('添付ファイルの再インデックス', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.mockResolvedValue({ ctx: { workspaceId: 'workspace', userId: 'guest', role: 'guest' }, error: null })
    updateSet.mockReturnValue({ where: vi.fn() })
    rows.splice(0, rows.length, file)
    isIndexable.mockReturnValue(true)
  })

  test('アクセスできないファイルのインデックスを変更しない', async () => {
    access.mockResolvedValue(false)
    const { POST } = await import('./route')
    const response = await POST(new Request('http://localhost'), params)
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: '現在のロール（guest）では、このファイルを閲覧する権限がありません',
    })
    expect(access).toHaveBeenCalledWith('workspace', 'guest', file, 'guest')
    expect(deleteWhere).not.toHaveBeenCalled()
    expect(updateSet).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  test('別ワークスペースのファイルを拒否する', async () => {
    access.mockResolvedValue(false)
    rows.splice(0, rows.length, { ...file, workspaceId: 'other-workspace' })
    const { POST } = await import('./route')
    const response = await POST(new Request('http://localhost'), params)
    expect(response.status).toBe(403)
    expect(access).toHaveBeenCalledWith('workspace', 'guest', expect.objectContaining({ workspaceId: 'other-workspace' }), 'guest')
    expect(deleteWhere).not.toHaveBeenCalled()
    expect(updateSet).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  test('存在しないファイルは404を返す', async () => {
    rows.length = 0
    const { POST } = await import('./route')
    const response = await POST(new Request('http://localhost'), params)
    expect(response.status).toBe(404)
    expect(access).not.toHaveBeenCalled()
    expect(deleteWhere).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  test('対象外形式は422を返しインデックスを変更しない', async () => {
    access.mockResolvedValue(true)
    isIndexable.mockReturnValue(false)
    const { POST } = await import('./route')
    const response = await POST(new Request('http://localhost'), params)
    expect(response.status).toBe(422)
    expect(deleteWhere).not.toHaveBeenCalled()
    expect(updateSet).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  test('アクセスできるファイルは再インデックスする', async () => {
    access.mockResolvedValue(true)
    const { POST } = await import('./route')
    const response = await POST(new Request('http://localhost'), params)
    expect(response.status).toBe(200)
    expect(deleteWhere).toHaveBeenCalledOnce()
    expect(updateSet).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledOnce()
  })
})
