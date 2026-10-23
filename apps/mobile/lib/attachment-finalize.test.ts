// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { finalizeAttachment } from './attachment-finalize'

const { mockApiFetch } = vi.hoisted(() => ({ mockApiFetch: vi.fn() }))
vi.mock('./api-fetch', () => ({ apiFetch: mockApiFetch }))

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const request = {
  channelId: 'channel-1',
  storagePath: 'ws/ch/user/file.pdf',
  fileName: 'guide.pdf',
  mimeType: 'application/pdf',
  fileSize: 8,
}

describe('添付ファイル finalize の再試行', () => {
  beforeEach(() => mockApiFetch.mockReset())

  it('失敗した finalize の同じ要求を再送し、upload-url を発行しない', async () => {
    mockApiFetch
      .mockResolvedValueOnce(json({ error: 'PDF最適化の開始に失敗しました。再試行してください' }, 503))
      .mockResolvedValueOnce(json({ fileId: 'f1' }))

    const error = await finalizeAttachment(request, 'Could not register the upload').catch((value) => value)
    await expect(error.retryFinalize()).resolves.toEqual({ fileId: 'f1' })

    expect(mockApiFetch).toHaveBeenCalledTimes(2)
    expect(mockApiFetch).toHaveBeenNthCalledWith(1, '/api/attachments/finalize', {
      method: 'POST', body: JSON.stringify(request),
    })
    expect(mockApiFetch).toHaveBeenNthCalledWith(2, '/api/attachments/finalize', {
      method: 'POST', body: JSON.stringify(request),
    })
  })

  it('finalize の応答が失われても同じ要求を再送できる', async () => {
    mockApiFetch
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValueOnce(json({ fileId: 'f1' }))

    const error = await finalizeAttachment(request, 'Could not register the upload').catch((value) => value)
    await expect(error.retryFinalize()).resolves.toEqual({ fileId: 'f1' })

    expect(mockApiFetch).toHaveBeenCalledTimes(2)
    expect(mockApiFetch).toHaveBeenNthCalledWith(2, '/api/attachments/finalize', {
      method: 'POST', body: JSON.stringify(request),
    })
  })
})
