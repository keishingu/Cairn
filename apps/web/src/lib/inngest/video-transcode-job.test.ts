// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

type Step = {
  run: (name: string, callback: () => Promise<unknown>) => Promise<unknown>
  sleep: (name: string, duration: string) => Promise<void>
}
type Handler = (args: { event: { data: { fileId: string; workspaceId: string } }; step: Step }) => Promise<unknown>
type FailureHandler = (args: { event: { data: { event: { data: { fileId: string } } } }; error: Error }) => Promise<void>

const mocks = vi.hoisted(() => {
  const state = {
    handler: undefined as Handler | undefined,
    onFailure: undefined as FailureHandler | undefined,
    file: undefined as Record<string, unknown> | undefined,
    latest: undefined as Record<string, unknown> | undefined,
    updates: [] as unknown[],
    txUpdates: [] as Record<string, unknown>[],
    usageDeltas: [] as unknown[],
    objectSize: 12_345 as number | undefined,
  }
  const query = (read: () => unknown) => ({
    from: () => ({
      where: () => ({
        limit: async () => (read() === undefined ? [] : [read()]),
        for: () => ({ limit: async () => (read() === undefined ? [] : [read()]) }),
      }),
    }),
  })
  return {
    state,
    db: {
      select: () => query(() => state.file),
      update: () => ({ set: (value: unknown) => ({ where: async () => { state.updates.push(value) } }) }),
      transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          select: () => query(() => state.latest),
          update: () => ({ set: (value: Record<string, unknown>) => ({ where: async () => { state.txUpdates.push(value) } }) }),
        }),
    },
    createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://storage.test/source' }, error: null })),
    createSignedUploadUrl: vi.fn(async () => ({ data: { signedUrl: 'https://storage.test/upload' }, error: null })),
    list: vi.fn(async (_folder: string, opts: { search: string }) => ({
      data: state.objectSize === undefined ? [] : [{ name: opts.search, metadata: { size: state.objectSize } }],
      error: null,
    })),
    remove: vi.fn(async () => ({ error: null })),
    start: vi.fn(async (input: { sandboxName: string }) => ({ sandboxName: input.sandboxName, cmdId: 'cmd-1' })),
    check: vi.fn(),
    stop: vi.fn(async () => undefined),
  }
})

vi.mock('./client', () => ({
  inngest: {
    createFunction: (config: { onFailure: FailureHandler }, _trigger: unknown, handler: Handler) => {
      mocks.state.handler = handler
      mocks.state.onFailure = config.onFailure
      return handler
    },
  },
}))
vi.mock('@cairn/db', () => ({ db: mocks.db, files: { metadata: 'files.metadata' } }))
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn(), sql: vi.fn(() => 'sql') }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: mocks.createSignedUrl,
        createSignedUploadUrl: mocks.createSignedUploadUrl,
        list: mocks.list,
        remove: mocks.remove,
      }),
    },
  }),
}))
vi.mock('@/lib/video/sandbox-runner', () => ({
  VIDEO_TRANSCODE_TIMEOUT_MS: 60 * 60 * 1000,
  startVideoTranscode: mocks.start,
  checkVideoTranscode: mocks.check,
  stopVideoTranscode: mocks.stop,
}))
vi.mock('@/lib/billing/storage-usage', () => ({
  recordStorageUsageDelta: vi.fn(async (_ws: string, delta: unknown) => { mocks.state.usageDeltas.push(delta) }),
}))

const step: Step = { run: (_name, callback) => callback(), sleep: async () => undefined }
const event = { data: { fileId: 'file-1', workspaceId: 'ws-1' } }

async function loadJob() {
  await import('./video-transcode-job')
  return { handler: mocks.state.handler!, onFailure: mocks.state.onFailure! }
}

describe('動画の圧縮版を作るジョブ', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(mocks.state, {
      file: { storagePath: 'ws-1/ch/u/videos/a.mov', metadata: { videoTranscodeStatus: 'pending' } },
      latest: { derivedFileSize: null, metadata: { videoTranscodeStatus: 'processing' } },
      updates: [],
      txUpdates: [],
      usageDeltas: [],
      objectSize: 12_345,
    })
  })

  it('Sandbox の ffmpeg に署名 URL を渡し、完了後に圧縮版を derived として保存する', async () => {
    mocks.check.mockResolvedValueOnce({ done: false }).mockResolvedValueOnce({ done: true, exitCode: 0, stderrTail: '' })
    const { handler } = await loadJob()

    await expect(handler({ event, step })).resolves.toEqual({ transcoded: true, derivedSize: 12_345 })

    expect(mocks.createSignedUploadUrl).toHaveBeenCalledWith('ws-1/ch/u/videos/derived/file-1.mp4', { upsert: true })
    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({ sourceUrl: 'https://storage.test/source', uploadUrl: 'https://storage.test/upload' }),
    )
    expect(mocks.check).toHaveBeenCalledTimes(2)
    expect(mocks.stop).toHaveBeenCalled()
    // 圧縮版は家賃対象外の derived として数える
    expect(mocks.state.usageDeltas).toEqual([{ originalBytes: 0, derivedBytes: 12_345 }])
    expect(mocks.state.txUpdates[0]).toMatchObject({
      derivedStoragePath: 'ws-1/ch/u/videos/derived/file-1.mp4',
      derivedFileSize: 12_345,
      derivedMimeType: 'video/mp4',
      metadata: { videoTranscodeStatus: 'ready' },
    })
  })

  it('ffmpeg が失敗したら Sandbox を止めて再試行せず失敗にする', async () => {
    mocks.check.mockResolvedValueOnce({ done: true, exitCode: 1, stderrTail: 'Invalid data found' })
    const { handler } = await loadJob()

    await expect(handler({ event, step })).rejects.toThrow('Invalid data found')
    expect(mocks.stop).toHaveBeenCalled()
    expect(mocks.state.txUpdates).toEqual([])
  })

  it('圧縮版ができている動画は作り直さない', async () => {
    mocks.state.file = { storagePath: 'ws-1/ch/u/videos/a.mov', metadata: { videoTranscodeStatus: 'ready' } }
    const { handler } = await loadJob()

    await expect(handler({ event, step })).resolves.toEqual({ skipped: true })
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('変換中にファイルが消されたら圧縮版だけを残さない', async () => {
    mocks.check.mockResolvedValueOnce({ done: true, exitCode: 0, stderrTail: '' })
    mocks.state.latest = undefined
    const { handler } = await loadJob()

    await expect(handler({ event, step })).resolves.toMatchObject({ skipped: true })
    expect(mocks.remove).toHaveBeenCalledWith(['ws-1/ch/u/videos/derived/file-1.mp4'])
  })

  it('最終的な失敗では状態を failed にし、保存済みの ready は上書きしない', async () => {
    const { onFailure } = await loadJob()
    const failureEvent = { data: { event: { data: { fileId: 'file-1' } } } }

    mocks.state.file = { id: 'file-1', metadata: { videoTranscodeStatus: 'processing' } }
    await onFailure({ event: failureEvent, error: new Error('boom') })
    expect(mocks.state.updates).toHaveLength(1)

    mocks.state.updates = []
    mocks.state.file = { id: 'file-1', metadata: { videoTranscodeStatus: 'ready' } }
    await onFailure({ event: failureEvent, error: new Error('boom') })
    expect(mocks.state.updates).toHaveLength(0)
  })
})
