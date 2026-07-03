// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { SupabaseClient } from '@supabase/supabase-js'

export const ATTACHMENTS_BUCKET = 'chat-attachments'

// 一覧アイコン・チャットのサムネ表示用の縮小版サイズ。
// 表示の度にオリジナル（最大10MB）を読み込むと帯域・描画コストが無駄なため。
const THUMBNAIL_MAX_DIMENSION = 480
const THUMBNAIL_QUALITY = 72

// オリジナルの storagePath からサムネ保存先を導出する（同じ階層の thumb/ 配下に置く）
export function thumbnailStoragePath(storagePath: string): string {
  const slash = storagePath.lastIndexOf('/')
  const dir = slash === -1 ? '' : storagePath.slice(0, slash + 1)
  const base = slash === -1 ? storagePath : storagePath.slice(slash + 1)
  const stem = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base
  return `${dir}thumb/${stem}.jpg`
}

// 画像バッファから JPEG サムネを生成する
export async function generateThumbnail(buffer: Buffer | ArrayBuffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer))
    .rotate()
    .resize({ width: THUMBNAIL_MAX_DIMENSION, height: THUMBNAIL_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: THUMBNAIL_QUALITY })
    .toBuffer()
}

// オリジナルを読み込んでサムネを生成・アップロードし、保存先パスを返す。
// 失敗時は null を返す（呼び出し側はオリジナル配信にフォールバックできる）。
export async function createThumbnailFromStorage(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).download(storagePath)
  if (error || !data) return null

  // 破損・未対応フォーマットで sharp が throw しても、呼び出し側の
  // 「1件失敗してもバッチは継続」を成立させるため null 契約を守る
  let thumb: Buffer
  try {
    thumb = await generateThumbnail(await data.arrayBuffer())
  } catch (e) {
    console.warn('[createThumbnailFromStorage] Thumbnail generation failed:', storagePath, e)
    return null
  }
  const thumbPath = thumbnailStoragePath(storagePath)
  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(thumbPath, thumb, { contentType: 'image/jpeg', upsert: true })
  if (uploadError) return null

  return thumbPath
}
