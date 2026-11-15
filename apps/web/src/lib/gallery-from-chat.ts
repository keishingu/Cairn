// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// チャットに添付された画像をギャラリーへ追加するときのサーバー側の画像処理。
// 通常のギャラリーアップロードはブラウザで圧縮版を作る（lib/process-image.ts）が、
// チャットの添付は既に Storage にあるため、同じ条件の圧縮版をサーバーで作る。

/** lib/process-image.ts の MAX_DIMENSION と揃える */
const DERIVED_MAX_DIMENSION = 2048
/** lib/process-image.ts の JPEG_QUALITY（0.85）と揃える */
const DERIVED_QUALITY = 85

export const GALLERY_DERIVED_MIME_TYPE = 'image/webp'
export const GALLERY_DERIVED_EXTENSION = 'webp'

/** 1メッセージから一度に追加できる画像の上限（添付上限より十分大きくする） */
export const GALLERY_FROM_MESSAGE_MAX = 20

export interface ImageCaptureMetadata {
  takenAt: Date | null
  latitude: number | null
  longitude: number | null
}

/** ギャラリー表示用の圧縮版（向きを補正し、長辺 2048px 以内の WebP）を作る */
export async function createGalleryDerivedImage(original: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp(original)
    .rotate()
    .resize({
      width: DERIVED_MAX_DIMENSION,
      height: DERIVED_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: DERIVED_QUALITY })
    .toBuffer()
}

/**
 * 撮影日時と位置を EXIF から読む。EXIF が無い・壊れている画像は null にする。
 * 投稿日時などの別の値で埋めると、撮影日として誤った日付を見せるため補わない。
 */
export async function readImageCaptureMetadata(original: Buffer): Promise<ImageCaptureMetadata> {
  const exifr = (await import('exifr')).default
  const [takenAt, gps] = await Promise.all([
    exifr
      .parse(original, ['DateTimeOriginal'])
      .then((exif: { DateTimeOriginal?: unknown } | undefined) =>
        exif?.DateTimeOriginal instanceof Date && !Number.isNaN(exif.DateTimeOriginal.getTime())
          ? exif.DateTimeOriginal
          : null,
      )
      .catch(() => null),
    exifr
      .gps(original)
      .then((value: { latitude?: unknown; longitude?: unknown } | undefined) =>
        typeof value?.latitude === 'number' && typeof value?.longitude === 'number'
          ? { latitude: value.latitude, longitude: value.longitude }
          : null,
      )
      .catch(() => null),
  ])
  return {
    takenAt,
    latitude: gps?.latitude ?? null,
    longitude: gps?.longitude ?? null,
  }
}
