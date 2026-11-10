// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// @vitest-environment node

import { describe, expect, test } from 'vitest'
import sharp from 'sharp'
import { createGalleryDerivedImage, readImageCaptureMetadata } from './gallery-from-chat'

const jpeg = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 120, g: 160, b: 200 } } }).jpeg().toBuffer()

describe('createGalleryDerivedImage', () => {
  test('長辺 2048px を超える画像は縮小して WebP にする', async () => {
    const derived = await createGalleryDerivedImage(await jpeg(4000, 3000))
    const meta = await sharp(derived).metadata()

    expect(meta.format).toBe('webp')
    expect(meta.width).toBe(2048)
    expect(meta.height).toBe(1536)
  })

  test('小さい画像は拡大しない', async () => {
    const derived = await createGalleryDerivedImage(await jpeg(640, 480))
    const meta = await sharp(derived).metadata()

    expect(meta.width).toBe(640)
    expect(meta.height).toBe(480)
  })
})

describe('readImageCaptureMetadata', () => {
  test('EXIF の撮影日時を読む', async () => {
    const withExif = await sharp(await jpeg(32, 32))
      .withExif({ IFD2: { DateTimeOriginal: '2026:08:01 12:34:56' } })
      .jpeg()
      .toBuffer()

    const meta = await readImageCaptureMetadata(withExif)

    expect(meta.takenAt).toBeInstanceOf(Date)
    expect(meta.takenAt?.getFullYear()).toBe(2026)
    expect(meta.latitude).toBeNull()
  })

  test('EXIF が無い画像は撮影日時も位置も null にし、別の日時で埋めない', async () => {
    const meta = await readImageCaptureMetadata(await jpeg(32, 32))

    expect(meta).toEqual({ takenAt: null, latitude: null, longitude: null })
  })
})
