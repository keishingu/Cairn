// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

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

/**
 * チャンネルへファイルをアップロードして files に登録する（チャットの添付とファイルタブで共用）。
 * ファイル本体を Vercel の Function へ送ると 4.5MB のリクエストボディ上限
 * (FUNCTION_PAYLOAD_TOO_LARGE) に阻まれるため、メタデータだけで署名付き URL を発行してもらい、
 * 本体はクライアントから Supabase Storage へ直接送る。
 */
export async function uploadAttachment(channelId: string, file: File): Promise<UploadedAttachment> {
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
  const { token, path, storagePath, mimeType } = (await urlRes.json()) as {
    token: string
    path: string
    storagePath: string
    mimeType: string
  }

  // 2. Supabase Storage へクライアントから直接アップロード(Vercel を経由しない)。
  //    storage-js は Blob/File を渡すと FormData 化し fileOptions.contentType を無視するため、
  //    Storage はファイル自身の File.type を見る。upload-url が正規化した MIME
  //    (例: .csv の application/octet-stream → text/csv) を反映させるには
  //    File.type がバケット許可リストに含まれる正規化後の値になっている必要がある。
  //    元の File.type が異なる場合は正規化後の type を持つ File でラップして渡す。
  const uploadBody = file.type === mimeType ? file : new File([file], file.name, { type: mimeType })
  const { error: uploadError } = await createSupabaseClient()
    .storage.from('chat-attachments')
    .uploadToSignedUrl(path, token, uploadBody)
  if (uploadError) throw new AttachmentUploadError('storage')

  // 3. files レコードを登録し検索インデックスジョブを発火する
  const finalizeRes = await fetchWithAuth('/api/attachments/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelId,
      storagePath,
      fileName: file.name,
      mimeType,
      fileSize: file.size,
    }),
  })
  if (!finalizeRes.ok) throw new AttachmentUploadError('finalize', await serverMessage(finalizeRes))
  return (await finalizeRes.json()) as UploadedAttachment
}
