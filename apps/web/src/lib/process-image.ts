// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

const MAX_DIMENSION = 2048
const JPEG_QUALITY = 0.85

export interface ProcessedImage {
  file: File
  takenAt: Date | null
  latitude: number | null
  longitude: number | null
}

export async function processImageForUpload(original: File): Promise<ProcessedImage> {
  const [takenAt, gps] = await Promise.all([
    extractExifDate(original),
    extractExifGps(original),
  ])

  let blob: Blob = original
  let fileName = original.name

  // HEIC → JPEG
  if (isHeic(original)) {
    const heic2any = await import('heic2any')
    const converted = await heic2any.default({ blob: original, toType: 'image/jpeg', quality: JPEG_QUALITY })
    blob = Array.isArray(converted) ? converted[0]! : converted
    fileName = fileName.replace(/\.heic$/i, '.jpg')
  }

  // リサイズ（最長辺が MAX_DIMENSION を超える場合のみ）
  const resized = await resizeIfNeeded(blob)

  return {
    file: new File([resized], fileName, { type: 'image/jpeg', lastModified: original.lastModified }),
    takenAt,
    latitude: gps?.latitude ?? null,
    longitude: gps?.longitude ?? null,
  }
}

function isHeic(file: File): boolean {
  return file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')
}

async function extractExifDate(file: File): Promise<Date | null> {
  if (file.type !== 'image/jpeg' && file.type !== 'image/webp' && !isHeic(file)) return null
  try {
    const exifr = await import('exifr')
    const exif = await exifr.parse(file, ['DateTimeOriginal'])
    return exif?.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal : null
  } catch {
    return null
  }
}

async function extractExifGps(file: File): Promise<{ latitude: number; longitude: number } | null> {
  if (file.type !== 'image/jpeg' && file.type !== 'image/webp' && !isHeic(file)) return null
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

function resizeIfNeeded(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const { width, height } = img
      const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height))
      if (scale === 1) {
        // リサイズ不要でも JPEG 統一のため Canvas を通す
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0)
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', JPEG_QUALITY)
      } else {
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(width * scale)
        canvas.height = Math.round(height * scale)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', JPEG_QUALITY)
      }
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
    img.src = url
  })
}
