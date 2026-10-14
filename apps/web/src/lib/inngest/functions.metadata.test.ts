// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0
// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const PROJECT = '20000000-0000-0000-0000-000000000001'
const TARGET = '30000000-0000-0000-0000-000000000001'
const SOURCE = '30000000-0000-0000-0000-000000000002'
const WORKSPACE = '10000000-0000-0000-0000-000000000001'
const USER = '80000000-0000-0000-0000-000000000001'
const state = vi.hoisted(() => ({
  handlers: new Map<string, (args: { event: { data: Record<string, string> }; step: { run: (name: string, callback: () => unknown) => Promise<unknown> } }) => Promise<unknown>>(),
  embed: vi.fn(),
  fetch: vi.fn(),
  send: vi.fn(),
}))

vi.mock('./client', () => ({ inngest: {
  createFunction: (options: { id: string }, _trigger: unknown, handler: never) => { state.handlers.set(options.id, handler); return options },
  send: state.send,
} }))
vi.mock('ai', () => ({ embedMany: state.embed }))
vi.mock('@/lib/ai/client', () => ({ openai: { embedding: () => 'test' }, EMBEDDING_MODEL: 'test' }))
vi.mock('@/lib/ai/chunk-text', () => ({ chunkText: (text: string) => text ? [text] : [] }))
vi.mock('@/lib/ai/extract-text', () => ({ isIndexable: () => true }))
vi.mock('@/lib/supabase/service', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/lib/push/send', () => ({ sendPushToUser: vi.fn() }))
vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: async () => ({ ctx: {
  userId: '80000000-0000-0000-0000-000000000001', workspaceId: '10000000-0000-0000-0000-000000000001', role: 'member',
}, error: null }) }))
vi.mock('@/lib/permissions', () => ({ canAccessFile: async () => true, requireRole: () => null,
  requireChannelAccess: async () => null, requireProjectAccess: async () => null,
}))
// 実際のPostgreSQL JSONB式を実行する。外部サービス・本番DBには接続しない。
vi.mock('@cairn/db', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const { pgTable, text, jsonb, boolean, integer } = await import('drizzle-orm/pg-core')
  const client = new PGlite()
  const files = pgTable('files', { id: text('id').primaryKey(), workspaceId: text('workspace_id'), projectId: text('project_id'),
    uploadedBy: text('uploaded_by'), metadata: jsonb('metadata'), fileName: text('file_name'), fileType: text('file_type'),
    storagePath: text('storage_path'), mimeType: text('mime_type'),
  })
  const projects = pgTable('projects', { id: text('id').primaryKey(), workspaceId: text('workspace_id'), archived: boolean('archived') })
  const galleryItems = pgTable('gallery_items', { id: text('id'), fileId: text('file_id') })
  const channels = pgTable('channels', { id: text('id'), projectId: text('project_id') })
  const documentChunks = pgTable('document_chunks', { workspaceId: text('workspace_id'), sourceType: text('source_type'), sourceId: text('source_id'),
    chunkIndex: integer('chunk_index'), content: text('content'), embedding: jsonb('embedding'),
  })
  await client.exec(`CREATE TABLE files (id text PRIMARY KEY, workspace_id text, project_id text, uploaded_by text, metadata jsonb, file_name text, file_type text, storage_path text, mime_type text);
    CREATE TABLE projects (id text PRIMARY KEY, workspace_id text, archived boolean);
    CREATE TABLE gallery_items (id text, file_id text);
    CREATE TABLE channels (id text, project_id text);
    CREATE TABLE document_chunks (workspace_id text, source_type text, source_id text, chunk_index integer, content text, embedding jsonb);`)
  return { db: drizzle(client), files, projects, galleryItems, channels, documentChunks, testClient: client }
})

import './functions'
import { POST as replace } from '@/app/api/projects/[id]/current-files/route'
import { POST as reindex } from '@/app/api/attachments/[fileId]/reindex/route'
import { POST as register } from '@/app/api/external-links/route'
import { db, files, projects, channels } from '@cairn/db'
import { eq, sql } from 'drizzle-orm'

async function metadata(id = TARGET) {
  const [row] = await db.select({ metadata: files.metadata }).from(files).where(eq(files.id, id))
  return row!.metadata as Record<string, unknown>
}
async function replaceCurrent() {
  const response = await replace(new Request('http://localhost/', { method: 'POST', body: JSON.stringify({
    fileId: TARGET, replaceFileId: SOURCE, note: 'Approved revision',
  }) }), { params: Promise.resolve({ id: PROJECT }) })
  expect(response.status).toBe(200)
}
async function index() {
  return state.handlers.get('index-external-link')!({ event: { data: { fileId: TARGET, workspaceId: WORKSPACE, docId: 'doc' } },
    step: { run: async (_name, callback) => callback() },
  })
}

describe('ファイルmetadataの競合（PostgreSQL JSONB）', () => {
  beforeAll(() => vi.stubGlobal('fetch', state.fetch))
  afterAll(async () => {
    vi.unstubAllGlobals()
    const { testClient } = await import('@cairn/db') as unknown as { testClient: { close: () => Promise<void> } }
    await testClient.close()
  })
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.execute(sql`TRUNCATE files, projects, channels, gallery_items, document_chunks`)
    await db.insert(projects).values({ id: PROJECT, workspaceId: WORKSPACE, archived: false } as never)
    await db.insert(files).values([
      { id: TARGET, workspaceId: WORKSPACE, projectId: PROJECT, uploadedBy: USER, fileName: 'Before', fileType: 'link',
        storagePath: 'document.pdf', mimeType: 'application/pdf', metadata: { indexingStatus: 'pending', externalUrl: 'https://docs.google.com/document/d/doc', channelId: 'legacy', thumbnailPath: 'thumb' } },
      { id: SOURCE, workspaceId: WORKSPACE, projectId: PROJECT, uploadedBy: USER, fileName: 'Source', fileType: 'link',
        metadata: { isLatest: true, latestChangeNotes: [{ note: 'Earlier change' }] } },
    ])
    state.fetch.mockResolvedValue({ ok: true, headers: new Headers({ 'content-type': 'text/plain', 'content-disposition': 'filename="Title.txt"' }), text: async () => 'content' })
    state.embed.mockResolvedValue({ embeddings: [[1, 2]] })
  })

  it.each([true, false])('embedMany中の差し替えで確定フラグ・履歴・他キーを保持する（タイトル有無=%s）', async (withTitle) => {
    if (!withTitle) state.fetch.mockResolvedValue({ ok: true, headers: new Headers({ 'content-type': 'text/plain' }), text: async () => 'content' })
    let resume!: () => void
    let started!: () => void
    const entered = new Promise<void>(resolve => { started = resolve })
    const gate = new Promise<void>(resolve => { resume = resolve })
    state.embed.mockImplementation(async () => { started(); await gate; return { embeddings: [[1, 2]] } })
    const indexing = index()
    await entered
    try { await replaceCurrent() } finally { resume() }
    await indexing
    expect(await metadata()).toMatchObject({ isLatest: true, indexingStatus: 'indexed', thumbnailPath: 'thumb', channelId: 'legacy',
      latestChangeNotes: [{ note: 'Earlier change' }, { note: 'Approved revision', replacedFileId: SOURCE }],
    })
    expect((await metadata(SOURCE))['isLatest']).toBeUndefined()
    const [row] = await db.select({ fileName: files.fileName }).from(files).where(eq(files.id, TARGET))
    expect(row!.fileName).toBe(withTitle ? 'Title' : 'Before')
  })

  it('インデックス完了後の差し替えでもindexedを保持する', async () => {
    await index()
    await replaceCurrent()
    expect(await metadata()).toMatchObject({ isLatest: true, indexingStatus: 'indexed', latestChangeNotes: expect.any(Array) })
  })

  it('metadataがNULLでも対象キーを初期化できる', async () => {
    await db.update(files).set({ metadata: sql`NULL` }).where(eq(files.id, TARGET))
    await index()
    expect(await metadata()).toEqual({ indexingStatus: 'indexed' })
  })

  it('空ドキュメントでも確定情報を保持してindexedにする', async () => {
    await replaceCurrent()
    state.fetch.mockResolvedValue({ ok: true, headers: new Headers({ 'content-type': 'text/plain' }), text: async () => '' })
    await index()
    expect(state.embed).not.toHaveBeenCalled()
    expect(await metadata()).toMatchObject({ isLatest: true, indexingStatus: 'indexed', latestChangeNotes: expect.any(Array) })
  })

  it('非公開ドキュメントのfailed更新で確定情報を保持する', async () => {
    await replaceCurrent()
    state.fetch.mockResolvedValue({ ok: false, headers: new Headers() })
    await index()
    expect(await metadata()).toMatchObject({ isLatest: true, indexingStatus: 'failed', latestChangeNotes: expect.any(Array) })
  })

  it('再インデックスのpending更新で確定情報を保持する', async () => {
    await replaceCurrent()
    const response = await reindex(new Request('http://localhost/'), { params: Promise.resolve({ fileId: TARGET }) })
    expect(response.status).toBe(200)
    expect(await metadata()).toMatchObject({ isLatest: true, indexingStatus: 'pending', latestChangeNotes: expect.any(Array), thumbnailPath: 'thumb' })
  })

  it('チャンネル追加で旧形式のチャンネル・確定情報を保持し重複を除く', async () => {
    await replaceCurrent()
    await db.insert(channels).values([{ id: 'one', projectId: PROJECT }, { id: 'two', projectId: PROJECT }] as never)
    const responses: Response[] = []
    for (const channelId of ['one', 'two', 'one']) responses.push(await register(new Request('http://localhost/', {
      method: 'POST', body: JSON.stringify({ url: 'https://docs.google.com/document/d/doc', channelId }),
    })))
    expect(responses.map(response => response.status)).toEqual([200, 200, 200])
    const meta = await metadata()
    expect(meta).toMatchObject({ isLatest: true, indexingStatus: 'pending', latestChangeNotes: expect.any(Array), thumbnailPath: 'thumb' })
    expect((meta['channelIds'] as string[]).sort()).toEqual(['legacy', 'one', 'two'])
  })
})
