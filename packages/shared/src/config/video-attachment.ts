// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 動画添付は Solo の支援者本人（課金無効なら全員）だけが送れる。判定はサーバーの
// upload-url / finalize が行い、ここは Web・アプリ・サーバーで形式・上限・送信方法を揃えるための定数だけを置く。

/** サーバーの上限（apps/web/src/lib/attachments.ts の MAX_VIDEO_FILE_SIZE）の元の値 */
export const MAX_VIDEO_ATTACHMENT_BYTES = 500 * 1024 * 1024

/** サーバーが受け付ける動画形式（apps/web/src/lib/attachments.ts の VIDEO_MIME_TYPES）の元の値 */
export const VIDEO_ATTACHMENT_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const

export function isVideoAttachmentMime(mimeType: string | null | undefined): boolean {
  return (
    typeof mimeType === 'string' &&
    (VIDEO_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mimeType)
  )
}

/** Supabase Storage の TUS は 6MB 固定のチャンクだけを受け付ける */
export const SUPABASE_TUS_CHUNK_SIZE = 6 * 1024 * 1024

export interface SignedResumableUploadOptions {
  endpoint: string
  headers: Record<string, string>
  metadata: Record<string, string>
  chunkSize: number
}

/**
 * upload-url が発行した署名トークンで、Supabase Storage へ TUS（再開可能アップロード）を行う設定を作る。
 * 署名付きの TUS は `/upload/resumable/sign` に送り、作成・PATCH・HEAD の全要求に x-signature が要る。
 * objectName は署名した保存パスと一致していなければ拒否される。
 */
export function signedResumableUploadOptions(input: {
  supabaseUrl: string
  apiKey: string
  bucket: string
  objectPath: string
  token: string
  contentType: string
}): SignedResumableUploadOptions {
  return {
    endpoint: `${input.supabaseUrl.replace(/\/+$/, '')}/storage/v1/upload/resumable/sign`,
    headers: { apikey: input.apiKey, 'x-signature': input.token },
    metadata: {
      bucketName: input.bucket,
      objectName: input.objectPath,
      contentType: input.contentType,
      cacheControl: '3600',
    },
    chunkSize: SUPABASE_TUS_CHUNK_SIZE,
  }
}
