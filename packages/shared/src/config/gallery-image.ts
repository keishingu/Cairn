// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// ギャラリーに置ける画像形式。Web のアップロード・チャットからの追加（Web・アプリ）・サーバーの判定で揃える。

export const GALLERY_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

export function isGalleryImageMimeType(mimeType: string | null | undefined): boolean {
  return (
    typeof mimeType === 'string' &&
    (GALLERY_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)
  )
}
