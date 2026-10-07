// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { AttachmentUploadError, uploadAttachment } from './upload-client'

vi.mock('@/lib/fetch-with-auth')
const uploadToSignedUrl = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl }) } }),
}))

const mockFetch = vi.mocked(fetchWithAuth)
const signed = { token: 'token-1', path: 'signed/path', storagePath: 'ws/ch/user/file.pdf', mimeType: 'application/pdf' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('uploadAttachment', () => {
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
    mockFetch.mockResolvedValueOnce(json({ error: 'ファイルサイズは 10MB 以下にしてください' }, 400))

    const error = await uploadAttachment('channel-1', new File(['x'], 'big.pdf', { type: 'application/pdf' })).catch(e => e)

    expect(error).toBeInstanceOf(AttachmentUploadError)
    expect(error).toMatchObject({ failure: 'prepare', serverMessage: 'ファイルサイズは 10MB 以下にしてください' })
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

  it('対応していない形式は、API を呼ぶ前に弾く', async () => {
    await expect(uploadAttachment('channel-1', new File(['x'], 'archive.zip', { type: 'application/zip' }))).rejects.toMatchObject({
      failure: 'unsupported_type',
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
