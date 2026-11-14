// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { isVideoAttachmentMime, signedResumableUploadOptions } from './video-attachment'

describe('signedResumableUploadOptions', () => {
  it('署名付き TUS の送り先・x-signature・保存パスのメタデータを揃える', () => {
    expect(
      signedResumableUploadOptions({
        supabaseUrl: 'https://example.supabase.co/',
        apiKey: 'anon',
        bucket: 'chat-attachments',
        objectPath: 'w/c/u/videos/a.mp4',
        token: 'tok',
        contentType: 'video/mp4',
      }),
    ).toEqual({
      endpoint: 'https://example.supabase.co/storage/v1/upload/resumable/sign',
      headers: { apikey: 'anon', 'x-signature': 'tok' },
      metadata: {
        bucketName: 'chat-attachments',
        objectName: 'w/c/u/videos/a.mp4',
        contentType: 'video/mp4',
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024,
    })
  })
})

describe('isVideoAttachmentMime', () => {
  it('MP4・MOV・WebM だけを動画添付として扱う', () => {
    expect(isVideoAttachmentMime('video/quicktime')).toBe(true)
    expect(isVideoAttachmentMime('video/x-msvideo')).toBe(false)
    expect(isVideoAttachmentMime(null)).toBe(false)
  })
})
