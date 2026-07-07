// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createServiceRoleClient } from '@/lib/supabase/service'

const COVERS_BUCKET = 'covers'

// カバー（ヒーロー）画像の保存サイズ。表示は詳細ヒーローでも横〜400px、
// 一覧は 88px なので、retina を考慮しても最長辺 1024px / JPEG 圧縮で十分。
// オリジナル（Place の 1200px+）を毎回読み込むのは帯域・描画コストの無駄。
const COVER_MAX_DIMENSION = 1024
const COVER_QUALITY = 78

// Google Place の写真を取得し、圧縮して covers バケットへ保存し、公開URLを返す。
// 失敗時は null（呼び出し側はカバー無しで続行する）。
// Google Places photo resource name の形式: places/{placeId}/photos/{photoRef}
const PLACE_PHOTO_NAME_RE = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/

export async function fetchAndStoreCoverFromPlace(placePhotoName: string): Promise<string | null> {
  const apiKey = process.env['GOOGLE_MAPS_API_KEY']
  if (!apiKey) return null

  if (!PLACE_PHOTO_NAME_RE.test(placePhotoName)) {
    console.warn('[cover-photo] invalid placePhotoName rejected:', placePhotoName)
    return null
  }

  try {
    const mediaRes = await fetch(
      `https://places.googleapis.com/v1/${placePhotoName}/media?maxWidthPx=${COVER_MAX_DIMENSION}&skipHttpRedirect=true&key=${apiKey}`,
    )
    if (!mediaRes.ok) return null

    const media = await mediaRes.json() as { photoUri?: string }
    if (!media.photoUri) return null

    const imgRes = await fetch(media.photoUri)
    if (!imgRes.ok) return null

    const original = Buffer.from(await imgRes.arrayBuffer())

    // 最長辺 1024px へ縮小し JPEG で再圧縮する（圧縮版のみを保存する方針）
    const sharp = (await import('sharp')).default
    const compressed = await sharp(original)
      .rotate()
      .resize({ width: COVER_MAX_DIMENSION, height: COVER_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: COVER_QUALITY })
      .toBuffer()

    const slug = placePhotoName.split('/').join('_')
    const storagePath = `place-photos/${slug}.jpg`
    const supabase = createServiceRoleClient()
    const { error: uploadError } = await supabase.storage
      .from(COVERS_BUCKET)
      .upload(storagePath, compressed, { contentType: 'image/jpeg', upsert: true })
    if (uploadError) return null

    return supabase.storage.from(COVERS_BUCKET).getPublicUrl(storagePath).data.publicUrl
  } catch (e) {
    console.warn('[cover-photo] place photo fetch/compress failed (skipped):', e)
    return null
  }
}
