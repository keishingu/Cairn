import { describe, expect, it, vi } from 'vitest'

const created = vi.hoisted(() => ({ items: [] as Array<{ file: unknown; opts: Record<string, unknown> }>, fail: false }))
vi.mock('tus-js-client', () => ({
  Upload: class {
    constructor(file: unknown, private readonly opts: Record<string, unknown>) {
      created.items.push({ file, opts })
    }
    start() {
      const opts = this.opts as { onProgress: (a: number, b: number) => void; onSuccess: () => void; onError: (e: Error) => void }
      if (created.fail) return opts.onError(new Error('offline'))
      opts.onProgress(6, 12)
      opts.onSuccess()
    }
  },
}))

import { uploadResumableToStorage } from './resumable-upload'

const input = {
  supabaseUrl: 'https://example.supabase.co',
  apiKey: 'anon',
  bucket: 'chat-attachments',
  storagePath: 'w/c/u/videos/a.mov',
  token: 'tok',
  mimeType: 'video/quicktime',
  file: { uri: 'file:///a.mov', name: 'a.mov', type: 'video/quicktime' },
}

describe('uploadResumableToStorage', () => {
  it('端末のファイルを読み込まず uri のまま署名付き TUS へ渡し、進捗を伝える', async () => {
    created.items = []
    created.fail = false
    const onProgress = vi.fn()
    await uploadResumableToStorage({ ...input, onProgress })

    expect(created.items[0]!.file).toEqual(input.file)
    expect(created.items[0]!.opts).toMatchObject({
      endpoint: 'https://example.supabase.co/storage/v1/upload/resumable/sign',
      headers: { apikey: 'anon', 'x-signature': 'tok' },
      metadata: { bucketName: 'chat-attachments', objectName: 'w/c/u/videos/a.mov', contentType: 'video/quicktime' },
      chunkSize: 6 * 1024 * 1024,
    })
    expect(onProgress).toHaveBeenCalledWith(6, 12)
  })

  it('送信に失敗したらエラーを返す', async () => {
    created.fail = true
    await expect(uploadResumableToStorage(input)).rejects.toThrow('offline')
    created.fail = false
  })
})
