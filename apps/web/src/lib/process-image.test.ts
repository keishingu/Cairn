// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { processImageForUpload } from './process-image'

const heic2any = vi.fn()
const parse = vi.fn()
const gps = vi.fn()

vi.mock('heic2any', () => ({
  default: heic2any,
}))

vi.mock('exifr', () => ({
  parse,
  gps,
}))

describe('processImageForUpload', () => {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  const originalCreateElement = document.createElement.bind(document)
  const originalImage = globalThis.Image

  beforeEach(() => {
    heic2any.mockReset()
    parse.mockReset()
    gps.mockReset()

    parse.mockResolvedValue(null)
    gps.mockResolvedValue(null)
    heic2any.mockResolvedValue(new Blob(['converted'], { type: 'image/jpeg' }))

    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()

    document.createElement = vi.fn((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({ drawImage: vi.fn() })),
          toBlob: (callback: BlobCallback) => callback(new Blob(['resized'], { type: 'image/jpeg' })),
        } as unknown as HTMLCanvasElement
      }

      return originalCreateElement(tagName)
    })

    class MockImage {
      width = 640
      height = 480
      onload: null | (() => void) = null
      onerror: null | (() => void) = null

      set src(_: string) {
        queueMicrotask(() => this.onload?.())
      }
    }

    globalThis.Image = MockImage as unknown as typeof Image
  })

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    document.createElement = originalCreateElement
    globalThis.Image = originalImage
  })

  it('HEIF を HEIC と同様に JPEG へ変換する', async () => {
    const original = new File(['heif'], 'avatar.heif', { type: 'image/heif' })

    const result = await processImageForUpload(original)

    expect(heic2any).toHaveBeenCalledWith({
      blob: original,
      toType: 'image/jpeg',
      quality: 0.85,
    })
    expect(result.file.name).toBe('avatar.jpg')
    expect(result.file.type).toBe('image/jpeg')
    expect(result.originalFile).toBe(original)
  })

  it('透過 PNG は PNG のまま維持する', async () => {
    const original = new File(['png'], 'avatar.png', { type: 'image/png' })

    const result = await processImageForUpload(original)

    expect(result.file.name).toBe('avatar.png')
    expect(result.file.type).toBe('image/png')
  })
})
