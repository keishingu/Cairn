// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PROJECT_ID = '20000000-0000-0000-0000-000000000001'
const TARGET_ID = '30000000-0000-0000-0000-000000000001'
const SOURCE_ID = '30000000-0000-0000-0000-000000000002'
const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'

const state = vi.hoisted(() => ({
  auth: vi.fn(),
  canAccess: vi.fn(),
  requireRole: vi.fn(),
  project: { id: '20000000-0000-0000-0000-000000000001', archived: false },
  rows: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: state.auth }))
vi.mock('@/lib/permissions', () => ({
  canAccessFile: state.canAccess,
  requireRole: state.requireRole,
}))
vi.mock('@cairn/db', () => {
  const projects = { name: 'projects' }
  const files = { name: 'files' }
  const galleryItems = { name: 'galleryItems' }
  const makeQuery = () => {
    let table: unknown
    type QueryBuilder = {
      from: (value: unknown) => QueryBuilder
      leftJoin: (...args: unknown[]) => QueryBuilder
      where: (...args: unknown[]) => QueryBuilder
      for: (...args: unknown[]) => QueryBuilder
      limit: () => Promise<unknown>
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise<unknown>
    }
    const query = {} as QueryBuilder
    query.from = (value: unknown) => { table = value; return query }
    query.leftJoin = () => query
    query.where = () => query
    query.for = () => query
    query.limit = () => Promise.resolve(table === projects ? [state.project] : state.rows)
    query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(table === projects ? [state.project] : state.rows).then(resolve, reject)
    return query
  }
  const update = (table: unknown) => ({
    set: (values: Record<string, unknown>) => {
      state.updates.push({ table, values })
      return { where: () => Promise.resolve(undefined) }
    },
  })
  const tx = {
    select: () => makeQuery(),
    update,
  }
  return {
    projects,
    files,
    galleryItems,
    db: {
      select: makeQuery,
      update,
      transaction: (callback: (transaction: typeof tx) => unknown) => callback(tx),
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
  sql: vi.fn(() => 'remove-isLatest'),
}))

import { POST } from './route'

const target = {
  id: TARGET_ID,
  workspaceId: WORKSPACE_ID,
  projectId: PROJECT_ID,
  uploadedBy: '90000000-0000-0000-0000-000000000001',
  metadata: {},
}
const source = {
  id: SOURCE_ID,
  workspaceId: WORKSPACE_ID,
  projectId: PROJECT_ID,
  uploadedBy: '90000000-0000-0000-0000-000000000002',
  metadata: { isLatest: true, latestChangeNotes: [{ note: 'Earlier change' }] },
}

function post(body: unknown) {
  return POST(new Request(`http://localhost/api/projects/${PROJECT_ID}/current-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: PROJECT_ID }) })
}

describe('POST /api/projects/[id]/current-files', () => {
  beforeEach(() => {
    state.auth.mockResolvedValue({
      ctx: { userId: '80000000-0000-0000-0000-000000000001', workspaceId: WORKSPACE_ID, role: 'member' },
      error: null,
    })
    state.canAccess.mockResolvedValue(true)
    state.requireRole.mockReturnValue(null)
    state.project = { id: PROJECT_ID, archived: false }
    state.rows = [{ ...target, metadata: {} }, { ...source, metadata: { ...source.metadata, latestChangeNotes: [...source.metadata.latestChangeNotes] } }]
    state.updates = []
  })
  afterEach(() => vi.clearAllMocks())

  it('差し替えには変更メモを必須にする', async () => {
    const response = await post({ fileId: TARGET_ID, replaceFileId: SOURCE_ID, note: '  ' })
    expect(response.status).toBe(400)
    expect(state.updates).toHaveLength(0)
  })

  it('空の差し替えIDを追加操作として扱わない', async () => {
    const response = await post({ fileId: TARGET_ID, replaceFileId: '' })
    expect(response.status).toBe(400)
    expect(state.updates).toHaveLength(0)
  })

  it('guestの編集を拒否する', async () => {
    state.auth.mockResolvedValue({
      ctx: { userId: '80000000-0000-0000-0000-000000000001', workspaceId: WORKSPACE_ID, role: 'guest' },
      error: null,
    })
    state.requireRole.mockReturnValue(new Response('Forbidden', { status: 403 }))
    const response = await post({ fileId: TARGET_ID })
    expect(response.status).toBe(403)
    expect(state.updates).toHaveLength(0)
  })

  it('既存ファイルを差し替え、変更メモを履歴に追加する', async () => {
    const response = await post({ fileId: TARGET_ID, replaceFileId: SOURCE_ID, note: 'Approved revision' })
    expect(response.status).toBe(200)
    expect(state.canAccess).toHaveBeenCalledTimes(2)
    expect(state.updates).toHaveLength(2)
    expect(state.updates[0]?.values['metadata']).toBe('remove-isLatest')
    const targetMetadata = state.updates[1]?.values['metadata'] as Record<string, unknown>
    expect(targetMetadata['isLatest']).toBe(true)
    expect(targetMetadata['latestChangeNotes']).toEqual([
      { note: 'Earlier change' },
      expect.objectContaining({ note: 'Approved revision', replacedFileId: SOURCE_ID }),
    ])
  })

  it('すでに確定済みの候補は拒否する', async () => {
    state.rows = [{ ...target, metadata: { isLatest: true } }]
    const response = await post({ fileId: TARGET_ID })
    expect(response.status).toBe(409)
    expect(state.updates).toHaveLength(0)
  })

  it('最新版でなくなった差し替え元は拒否する', async () => {
    state.rows = [target, { ...source, metadata: { isLatest: false } }]
    const response = await post({ fileId: TARGET_ID, replaceFileId: SOURCE_ID, note: 'Reason' })
    expect(response.status).toBe(409)
    expect(state.updates).toHaveLength(0)
  })

  it('差し替え元または候補へのアクセスが無い場合は更新しない', async () => {
    state.canAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const response = await post({ fileId: TARGET_ID, replaceFileId: SOURCE_ID, note: 'Reason' })
    expect(response.status).toBe(403)
    expect(state.updates).toHaveLength(0)
  })

  it('UUIDでないファイルIDを拒否する', async () => {
    const response = await post({ fileId: 'bad-id' })
    expect(response.status).toBe(400)
    expect(state.updates).toHaveLength(0)
  })
})
