// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { AttachmentUploadError, uploadAttachment } from './upload-client'

vi.mock('@/lib/fetch-with-auth')
const tus = vi.hoisted(() => ({ options: [] as Array<Record<string, unknown>>, fail: false }))
vi.mock('tus-js-client', () => ({
  Upload: class {
    constructor(_file: unknown, private readonly opts: Record<string, unknown>) {
      tus.options.push(opts)
    }
    start() {
      const opts = this.opts as { onProgress: (a: number, b: number) => void; onSuccess: () => void; onError: (e: Error) => void }
      if (tus.fail) {
        opts.onError(new Error('network'))
        return
      }
      opts.onProgress(6, 12)
      opts.onSuccess()
    }
  },
}))
const uploadToSignedUrl = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl }) } }),
}))

const mockFetch = vi.mocked(fetchWithAuth)
const signed = { token: 'token-1', path: 'signed/path', storagePath: 'ws/ch/user/file.pdf', mimeType: 'application/pdf' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('添付ファイルのアップロード（uploadAttachment）', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    uploadToSignedUrl.mockReset()
    uploadToSignedUrl.mockResolvedValue({ error: null })
  })

  it('ファイル本体は API へ送らず、URL 発行 → Storage へ直接送信 → 登録の順に進める', async () => {
    mockFetch
      .mockResolvedValueOnce(json(signed))
      .mockResolvedValueOnce(json({ fileId: 'f1', fileName: 'guide.pdf', mimeType: 'application/pdf', fileSize: 8 }, 201))
    const file = new File(['%PDF-1.4'], 'guide.pdf', { type: 'application/pdf' })

    await expect(uploadAttachment('channel-1', file)).resolves.toMatchObject({ fileId: 'f1' })

    expect(mockFetch.mock.calls.map(([url]) => url)).toEqual(['/api/attachments/upload-url', '/api/attachments/finalize'])
    // Vercel の 4.5MB 上限に当たらないよう、API へ送るのはメタデータの JSON だけ
    for (const [, init] of mockFetch.mock.calls) expect(typeof init?.body).toBe('string')
    expect(JSON.parse(mockFetch.mock.calls[0]![1]!.body as string)).toEqual({
      channelId: 'channel-1', fileName: 'guide.pdf', mimeType: 'application/pdf', fileSize: file.size,
    })
    expect(uploadToSignedUrl).toHaveBeenCalledWith('signed/path', 'token-1', file)
  })

  it('URL 発行で拒否されたら、サーバーが返した理由を持つエラーにし、Storage へは送らない', async () => {
    mockFetch.mockResolvedValueOnce(json({ error: 'ファイルサイズは 50MiB 以下にしてください' }, 400))

    const error = await uploadAttachment('channel-1', new File(['x'], 'big.pdf', { type: 'application/pdf' })).catch(e => e)

    expect(error).toBeInstanceOf(AttachmentUploadError)
    expect(error).toMatchObject({ failure: 'prepare', serverMessage: 'ファイルサイズは 50MiB 以下にしてください' })
    expect(uploadToSignedUrl).not.toHaveBeenCalled()
  })

  it('Storage への送信に失敗したら登録しない', async () => {
    mockFetch.mockResolvedValueOnce(json(signed))
    uploadToSignedUrl.mockResolvedValue({ error: new Error('mime type not supported') })

    await expect(uploadAttachment('channel-1', new File(['x'], 'a.pdf', { type: 'application/pdf' }))).rejects.toMatchObject({
      failure: 'storage',
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('finalize が失敗した後は同じ保存先を finalize だけで再試行する', async () => {
    mockFetch
      .mockResolvedValueOnce(json(signed))
      .mockResolvedValueOnce(json({ error: 'PDF最適化の開始に失敗しました。再試行してください' }, 503))
      .mockResolvedValueOnce(json({ fileId: 'f1', fileName: 'guide.pdf', mimeType: 'application/pdf', fileSize: 8 }, 200))
    const file = new File(['%PDF-1.4'], 'guide.pdf', { type: 'application/pdf' })

    const error = await uploadAttachment('channel-1', file).catch(e => e)
    expect(error).toBeInstanceOf(AttachmentUploadError)
    expect(error).toMatchObject({ failure: 'finalize' })
    await expect(error.retryFinalize()).resolves.toMatchObject({ fileId: 'f1' })

    expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/attachments/upload-url', '/api/attachments/finalize', '/api/attachments/finalize',
    ])
    expect(JSON.parse(mockFetch.mock.calls[1]![1]!.body as string)).toEqual(
      JSON.parse(mockFetch.mock.calls[2]![1]!.body as string),
    )
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(1)
  })

  it('finalize の応答が失われても同じ finalize 要求を再試行できる', async () => {
    mockFetch
      .mockResolvedValueOnce(json(signed))
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValueOnce(json({ fileId: 'f1', fileName: 'guide.pdf', mimeType: 'application/pdf', fileSize: 8 }, 200))
    const file = new File(['%PDF-1.4'], 'guide.pdf', { type: 'application/pdf' })

    const error = await uploadAttachment('channel-1', file).catch(e => e)
    expect(error).toMatchObject({ failure: 'finalize', serverMessage: 'network unavailable' })
    await expect(error.retryFinalize()).resolves.toMatchObject({ fileId: 'f1' })

    expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/attachments/upload-url', '/api/attachments/finalize', '/api/attachments/finalize',
    ])
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(1)
  })

  it('対応していない形式は、API を呼ぶ前に弾く', async () => {
    await expect(uploadAttachment('channel-1', new File(['x'], 'archive.zip', { type: 'application/zip' }))).rejects.toMatchObject({
      failure: 'unsupported_type',
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('動画は Storage の署名付き TUS で送り、進捗を伝えてから登録する', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'anon')
    tus.options = []
    tus.fail = false
    mockFetch
      .mockResolvedValueOnce(json({ token: 'tok', path: 'w/c/u/videos/a.mp4', storagePath: 'w/c/u/videos/a.mp4', mimeType: 'video/mp4', resumable: true, bucket: 'chat-videos' }))
      .mockResolvedValueOnce(json({ fileId: 'v1', fileName: 'a.mp4', mimeType: 'video/mp4', fileSize: 12 }, 201))
    const onProgress = vi.fn()

    await expect(
      uploadAttachment('channel-1', new File(['video-bytes'], 'a.mp4', { type: 'video/mp4' }), { onProgress }),
    ).resolves.toMatchObject({ fileId: 'v1' })

    expect(uploadToSignedUrl).not.toHaveBeenCalled()
    expect(tus.options[0]).toMatchObject({
      endpoint: 'https://example.supabase.co/storage/v1/upload/resumable/sign',
      headers: { apikey: 'anon', 'x-signature': 'tok' },
      metadata: { bucketName: 'chat-videos', objectName: 'w/c/u/videos/a.mp4', contentType: 'video/mp4' },
    })
    expect(onProgress).toHaveBeenCalledWith(6, 12)
    vi.unstubAllEnvs()
  })

  it('TUS の送信に失敗した動画は登録しない', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'anon')
    tus.options = []
    tus.fail = true
    mockFetch.mockResolvedValueOnce(json({ token: 'tok', path: 'p', storagePath: 'w/c/u/videos/a.mp4', mimeType: 'video/mp4', resumable: true, bucket: 'chat-videos' }))

    await expect(
      uploadAttachment('channel-1', new File(['x'], 'a.mp4', { type: 'video/mp4' })),
    ).rejects.toMatchObject({ failure: 'storage' })
    expect(tus.options).toHaveLength(1)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    tus.fail = false
    vi.unstubAllEnvs()
  })
})
