// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

const MAX_DIMENSION = 2048
const JPEG_QUALITY = 0.85
const PNG_OUTPUT_TYPE = 'image/png'
const WEBP_OUTPUT_TYPE = 'image/webp'
const JPEG_OUTPUT_TYPE = 'image/jpeg'

export interface ProcessedImage {
  // 既存の呼び出し元との互換性を保つ、表示用の圧縮派生。
  file: File
  originalFile: File
  takenAt: Date | null
  latitude: number | null
  longitude: number | null
}

export async function processImageForUpload(original: File): Promise<ProcessedImage> {
  const [takenAt, gps] = await Promise.all([extractExifDate(original), extractExifGps(original)])

  // HEIC/HEIF → JPEG
  const source = isHeicLike(original) ? await convertHeicToJpeg(original) : original
  const blob: Blob = source
  const fileName = source.name

  // リサイズ（最長辺が MAX_DIMENSION を超える場合のみ）
  const outputType = getOutputType(original, blob)
  const resized = await resizeIfNeeded(blob, outputType)

  return {
    file: new File([resized], fileName, { type: outputType, lastModified: original.lastModified }),
    originalFile: original,
    takenAt,
    latitude: gps?.latitude ?? null,
    longitude: gps?.longitude ?? null,
  }
}

function getOutputType(original: File, blob: Blob): string {
  if (isHeicLike(original)) return JPEG_OUTPUT_TYPE
  if (blob.type === PNG_OUTPUT_TYPE || original.type === PNG_OUTPUT_TYPE) return PNG_OUTPUT_TYPE
  if (blob.type === WEBP_OUTPUT_TYPE || original.type === WEBP_OUTPUT_TYPE) return WEBP_OUTPUT_TYPE
  return JPEG_OUTPUT_TYPE
}

/**
 * HEIC の変換に失敗したことを表す。変換ライブラリの例外は英語の内部メッセージで、そのまま見せても
 * 利用者は次に何をすればよいか分からないため、呼び出し側でこの型を見分けて専用の案内に置き換える。
 */
export class HeicConversionError extends Error {
  constructor(cause: unknown) {
    super('HEIC conversion failed', { cause })
    this.name = 'HeicConversionError'
  }
}

/**
 * HEIC/HEIF を、どのブラウザでも表示できる JPEG に変換する（リサイズはしない）。
 * iPhone の写真は既定で HEIC だが、Safari 以外は表示できず、添付バケットも受け付けない。
 */
export async function convertHeicToJpeg(original: File): Promise<File> {
  let converted: Blob | Blob[]
  try {
    const heic2any = await import('heic2any')
    converted = await heic2any.default({
      blob: original,
      toType: JPEG_OUTPUT_TYPE,
      quality: JPEG_QUALITY,
    })
  } catch (cause) {
    throw new HeicConversionError(cause)
  }
  const blob = Array.isArray(converted) ? converted[0]! : converted
  const fileName = /\.(heic|heif)$/i.test(original.name)
    ? original.name.replace(/\.(heic|heif)$/i, '.jpg')
    : `${original.name}.jpg`
  return new File([blob], fileName, { type: JPEG_OUTPUT_TYPE, lastModified: original.lastModified })
}

// Windows や一部のブラウザは HEIC の MIME を空で渡すため、拡張子でも判定する
export function isHeicLike(file: Pick<File, 'name' | 'type'>): boolean {
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    file.name.toLowerCase().endsWith('.heic') ||
    file.name.toLowerCase().endsWith('.heif')
  )
}

async function extractExifDate(file: File): Promise<Date | null> {
  if (file.type !== 'image/jpeg' && file.type !== 'image/webp' && !isHeicLike(file)) return null
  try {
    const exifr = await import('exifr')
    const exif = await exifr.parse(file, ['DateTimeOriginal'])
    return exif?.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal : null
  } catch {
    return null
  }
}

async function extractExifGps(file: File): Promise<{ latitude: number; longitude: number } | null> {
  if (file.type !== 'image/jpeg' && file.type !== 'image/webp' && !isHeicLike(file)) return null
  try {
    const exifr = await import('exifr')
    const gps = await exifr.gps(file)
    if (typeof gps?.latitude === 'number' && typeof gps?.longitude === 'number') {
      return { latitude: gps.latitude, longitude: gps.longitude }
    }
    return null
  } catch {
    return null
  }
}

function resizeIfNeeded(blob: Blob, outputType: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const { width, height } = img
      const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height))
      if (scale === 1) {
        // リサイズ不要でもアップロード前に再エンコードして扱いを統一する
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0)
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
          outputType,
          JPEG_QUALITY,
        )
      } else {
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(width * scale)
        canvas.height = Math.round(height * scale)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
          outputType,
          JPEG_QUALITY,
        )
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image load failed'))
    }
    img.src = url
  })
}
