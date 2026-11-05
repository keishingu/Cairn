// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { signedResumableUploadOptions } from '@cairn/shared'
import { GENERIC_MIME_TYPES, resolveAttachmentMimeType } from '@/lib/attachments'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'

export type AttachmentUploadFailure =
  /** 拡張子か MIME から形式は分かるが、対応していない */
  | 'unsupported_type'
  /** 拡張子も MIME も無く、形式を判定できない */
  | 'unknown_type'
  | 'prepare'
  | 'storage'
  | 'finalize'

/** 画面ごとに文言が違うため、ここでは翻訳しない。サーバーが理由を返した時だけ `serverMessage` に入れる */
export class AttachmentUploadError extends Error {
  constructor(
    readonly failure: AttachmentUploadFailure,
    readonly serverMessage?: string,
    readonly retryFinalize?: () => Promise<UploadedAttachment>,
  ) {
    super(serverMessage ?? failure)
    this.name = 'AttachmentUploadError'
  }
}

export interface UploadedAttachment {
  fileId: string
  fileName: string
  mimeType: string | null
  fileSize: number | null
}

async function serverMessage(res: Response): Promise<string | undefined> {
  const data = (await res.json().catch(() => ({}))) as { error?: unknown }
  return typeof data.error === 'string' ? data.error : undefined
}

export interface AttachmentFinalizeRequest {
  channelId: string
  storagePath: string
  fileName: string
  mimeType: string
  fileSize: number
}

async function finalizeAttachment(body: AttachmentFinalizeRequest): Promise<UploadedAttachment> {
  const retryFinalize = () => finalizeAttachment(body)
  let finalizeRes: Response
  try {
    finalizeRes = await fetchWithAuth('/api/attachments/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new AttachmentUploadError(
      'finalize',
      error instanceof Error ? error.message : undefined,
      retryFinalize,
    )
  }
  if (!finalizeRes.ok) {
    throw new AttachmentUploadError('finalize', await serverMessage(finalizeRes), retryFinalize)
  }
  return (await finalizeRes.json()) as UploadedAttachment
}

export interface UploadAttachmentOptions {
  /** 動画など再開可能アップロードで送るときの進捗（送信済みバイト・総バイト） */
  onProgress?: (uploadedBytes: number, totalBytes: number) => void
}

// 50MiB を超え得る動画は、署名トークンを x-signature に載せた TUS で送る。
// 回線が一時的に切れても 6MB 単位で再送し、最初からやり直さない
async function uploadResumable(
  file: File,
  signed: { token: string; path: string; mimeType: string },
  onProgress?: UploadAttachmentOptions['onProgress'],
): Promise<void> {
  const { Upload } = await import('tus-js-client')
  const options = signedResumableUploadOptions({
    supabaseUrl: process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    apiKey: process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']!,
    bucket: 'chat-attachments',
    objectPath: signed.path,
    token: signed.token,
    contentType: signed.mimeType,
  })
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: options.endpoint,
      headers: options.headers,
      metadata: options.metadata,
      chunkSize: options.chunkSize,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      uploadDataDuringCreation: true,
      // 署名ごとに保存先が変わるため、別の送信の続きとして再開させない
      storeFingerprintForResuming: false,
      onProgress: (sent, total) => onProgress?.(sent, total),
      onError: reject,
      onSuccess: () => resolve(),
    })
    upload.start()
  })
}

/**
 * チャンネルへファイルをアップロードして files に登録する（チャットの添付とファイルタブで共用）。
 * ファイル本体を Vercel の Function へ送ると 4.5MB のリクエストボディ上限
 * (FUNCTION_PAYLOAD_TOO_LARGE) に阻まれるため、メタデータだけで署名付き URL を発行してもらい、
 * 本体はクライアントから Supabase Storage へ直接送る。
 */
export async function uploadAttachment(
  channelId: string,
  file: File,
  options: UploadAttachmentOptions = {},
): Promise<UploadedAttachment> {
  let uploadMimeType = resolveAttachmentMimeType(file.name, file.type)
  if (!uploadMimeType && GENERIC_MIME_TYPES.has(file.type)) {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
    uploadMimeType = resolveAttachmentMimeType(file.name, file.type, head)
  }
  if (!uploadMimeType) {
    const identifiable = file.name.includes('.') || !GENERIC_MIME_TYPES.has(file.type)
    throw new AttachmentUploadError(identifiable ? 'unsupported_type' : 'unknown_type')
  }

  // 1. 署名付きアップロードURLを発行してもらう(メタデータのみ送信)
  const urlRes = await fetchWithAuth('/api/attachments/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelId,
      fileName: file.name,
      mimeType: uploadMimeType,
      fileSize: file.size,
    }),
  })
  if (!urlRes.ok) throw new AttachmentUploadError('prepare', await serverMessage(urlRes))
  const { token, path, storagePath, mimeType, resumable } = (await urlRes.json()) as {
    token: string
    path: string
    storagePath: string
    mimeType: string
    resumable?: boolean
  }

  // 2. Supabase Storage へクライアントから直接アップロード(Vercel を経由しない)。
  //    storage-js は Blob/File を渡すと FormData 化し fileOptions.contentType を無視するため、
  //    Storage はファイル自身の File.type を見る。upload-url が正規化した MIME
  //    (例: .csv の application/octet-stream → text/csv) を反映させるには
  //    File.type がバケット許可リストに含まれる正規化後の値になっている必要がある。
  //    元の File.type が異なる場合は正規化後の type を持つ File でラップして渡す。
  if (resumable) {
    try {
      await uploadResumable(file, { token, path, mimeType }, options.onProgress)
    } catch (error) {
      console.error('[uploadAttachment] resumable upload failed:', error)
      throw new AttachmentUploadError('storage')
    }
  } else {
    const uploadBody = file.type === mimeType ? file : new File([file], file.name, { type: mimeType })
    const { error: uploadError } = await createSupabaseClient()
      .storage.from('chat-attachments')
      .uploadToSignedUrl(path, token, uploadBody)
    if (uploadError) throw new AttachmentUploadError('storage')
  }

  // 3. files レコードを登録し検索インデックスジョブを発火する
  return finalizeAttachment({
    channelId,
    storagePath,
    fileName: file.name,
    mimeType,
    fileSize: file.size,
  })
}
