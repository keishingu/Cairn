// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetAuthContext,
  mockRequireRole,
  mockRequireChannelAccess,
  mockDbSelect,
  mockDbUpdate,
  mockDbDelete,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireRole: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbDelete: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({
  requireRole: mockRequireRole,
  requireChannelAccess: mockRequireChannelAccess,
}))
vi.mock('@cairn/db', () => ({
  db: { select: mockDbSelect, update: mockDbUpdate, delete: mockDbDelete },
  channels: {
    id: 'channels.id',
    name: 'channels.name',
    workspaceId: 'channels.workspaceId',
    type: 'channels.type',
    parentChannelId: 'channels.parentChannelId',
    archivedAt: 'channels.archivedAt',
  },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  sql: vi.fn(() => 'sql'),
}))

const routeContext = { params: Promise.resolve({ channelId: 'channel-1' }) }

function selectResult(result: unknown[]) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  })
}

function updateResult(result: unknown[]) {
  const builder = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  }
  mockDbUpdate.mockReturnValue(builder)
  return builder
}

function deleteResult(result: unknown[]) {
  const builder = {
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  }
  mockDbDelete.mockReturnValue(builder)
  return builder
}

function patchRequest(name: unknown = '新しい名前') {
  return patchBodyRequest({ name })
}

function patchBodyRequest(body: unknown) {
  return new Request('http://localhost/api/channels/channel-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('ワークスペースチャンネルの名称変更と削除', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1', role: 'admin' },
      error: null,
    })
    mockRequireRole.mockReturnValue(null)
    mockRequireChannelAccess.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('管理者はプロジェクトに紐づかないチャンネル名を変更できる', async () => {
    selectResult([{ id: 'channel-1', parentChannelId: null }])
    const update = updateResult([{ id: 'channel-1', name: '新しい名前' }])
    const { PATCH } = await import('./route')

    const response = await PATCH(patchRequest(), routeContext)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: 'channel-1', name: '新しい名前' })
    expect(mockRequireRole).toHaveBeenCalledWith('admin', 'admin')
    expect(update.set).toHaveBeenCalledWith({ name: '新しい名前' })
  })

  it('メンバーは直下スレッドの名前を変更できる', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1', role: 'member' },
      error: null,
    })
    selectResult([{ id: 'thread-1', parentChannelId: 'channel-1' }])
    updateResult([{ id: 'thread-1', name: '準備' }])
    const { PATCH } = await import('./route')

    const response = await PATCH(patchRequest('準備'), routeContext)

    expect(response.status).toBe(200)
    expect(mockRequireRole).toHaveBeenCalledWith('member', 'member')
  })

  it('メンバーは親チャンネルの名前を変更できない', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1', role: 'member' },
      error: null,
    })
    mockRequireRole.mockReturnValue(new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }))
    selectResult([{ id: 'channel-1', parentChannelId: null }])
    const { PATCH } = await import('./route')

    const response = await PATCH(patchRequest(), routeContext)

    expect(response.status).toBe(403)
    expect(mockRequireRole).toHaveBeenCalledWith('member', 'admin')
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('プロジェクトチャンネルや存在しないチャンネルは変更しない', async () => {
    selectResult([])
    const { PATCH } = await import('./route')

    const response = await PATCH(patchRequest(), routeContext)

    expect(response.status).toBe(404)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('空の名前と60文字超は保存しない', async () => {
    selectResult([{ id: 'channel-1', parentChannelId: null }])
    const { PATCH } = await import('./route')

    const empty = await PATCH(patchRequest('   '), routeContext)
    expect(empty.status).toBe(400)
    await expect(empty.json()).resolves.toEqual({ error: 'チャンネル名を入力してください' })

    const tooLong = await PATCH(patchRequest('あ'.repeat(61)), routeContext)
    expect(tooLong.status).toBe(400)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('参加していない非公開チャンネルは変更できない', async () => {
    selectResult([{ id: 'channel-1', parentChannelId: null }])
    mockRequireChannelAccess.mockResolvedValue(new Response(null, { status: 403 }))
    const { PATCH } = await import('./route')

    const response = await PATCH(patchRequest(), routeContext)

    expect(response.status).toBe(403)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('メンバーはスレッドをアーカイブでき、名前は変えない', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1', role: 'member' },
      error: null,
    })
    selectResult([{ id: 'thread-1', parentChannelId: 'channel-1', archiveColumnReady: true }])
    const update = updateResult([{ id: 'thread-1', name: '準備', archived: true }])
    const { PATCH } = await import('./route')

    const response = await PATCH(patchBodyRequest({ archived: true }), routeContext)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: 'thread-1', name: '準備', archived: true })
    expect(mockRequireRole).toHaveBeenCalledWith('member', 'member')
    expect(update.set).toHaveBeenCalledWith({ archivedAt: 'sql' })
  })

  it('スレッドのアーカイブを解除できる', async () => {
    selectResult([{ id: 'thread-1', parentChannelId: 'channel-1', archiveColumnReady: true }])
    const update = updateResult([{ id: 'thread-1', name: '準備', archived: false }])
    const { PATCH } = await import('./route')

    const response = await PATCH(patchBodyRequest({ archived: false }), routeContext)

    expect(response.status).toBe(200)
    expect(update.set).toHaveBeenCalledWith({ archivedAt: null })
  })

  it('migration 適用前はアーカイブを変更せず準備中を返す', async () => {
    selectResult([{ id: 'thread-1', parentChannelId: 'channel-1', archiveColumnReady: false }])
    const { PATCH } = await import('./route')

    const response = await PATCH(patchBodyRequest({ archived: true }), routeContext)

    expect(response.status).toBe(503)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('親チャンネルはアーカイブできない', async () => {
    selectResult([{ id: 'channel-1', parentChannelId: null }])
    const { PATCH } = await import('./route')

    const response = await PATCH(patchBodyRequest({ archived: true }), routeContext)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'アーカイブできるのはスレッドだけです' })
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('ゲストはスレッドをアーカイブできない', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1', role: 'guest' },
      error: null,
    })
    mockRequireRole.mockReturnValue(new Response(null, { status: 403 }))
    selectResult([{ id: 'thread-1', parentChannelId: 'channel-1' }])
    const { PATCH } = await import('./route')

    const response = await PATCH(patchBodyRequest({ archived: true }), routeContext)

    expect(response.status).toBe(403)
    expect(mockRequireRole).toHaveBeenCalledWith('guest', 'member')
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('変更内容がない・真偽値でないアーカイブ指定は受け付けない', async () => {
    const { PATCH } = await import('./route')

    const empty = await PATCH(patchBodyRequest({}), routeContext)
    expect(empty.status).toBe(400)

    const invalid = await PATCH(patchBodyRequest({ archived: 'yes' }), routeContext)
    expect(invalid.status).toBe(400)
    expect(mockDbSelect).not.toHaveBeenCalled()
  })

  it('管理者はチャンネルを削除できる', async () => {
    selectResult([{ id: 'channel-1', parentChannelId: null }])
    deleteResult([{ id: 'channel-1' }])
    const { DELETE } = await import('./route')

    const response = await DELETE(new Request('http://localhost/api/channels/channel-1', { method: 'DELETE' }), routeContext)

    expect(response.status).toBe(204)
    expect(mockRequireRole).toHaveBeenCalledWith('admin', 'admin')
    expect(mockDbDelete).toHaveBeenCalled()
  })

  it('ゲストはスレッドを削除できない', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1', role: 'guest' },
      error: null,
    })
    mockRequireRole.mockReturnValue(new Response(null, { status: 403 }))
    selectResult([{ id: 'thread-1', parentChannelId: 'channel-1' }])
    const { DELETE } = await import('./route')

    const response = await DELETE(new Request('http://localhost/api/channels/channel-1', { method: 'DELETE' }), routeContext)

    expect(response.status).toBe(403)
    expect(mockRequireRole).toHaveBeenCalledWith('guest', 'member')
    expect(mockDbDelete).not.toHaveBeenCalled()
  })
})
