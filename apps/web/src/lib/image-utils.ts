// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

function isGifImage(file: File): boolean {
  return file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')
}

function isPngImage(file: File): boolean {
  return file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
}

function isWebpImage(file: File): boolean {
  return file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp')
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  )
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length))
}

async function isAnimatedPngImage(file: File): Promise<boolean> {
  if (!isPngImage(file)) return false

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!hasPngSignature(bytes)) return false

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 8
  while (offset + 8 <= bytes.length) {
    const chunkLength = view.getUint32(offset)
    const chunkType = readAscii(bytes, offset + 4, 4)
    if (chunkType === 'acTL') return true
    offset += 12 + chunkLength
  }

  return false
}

async function isAnimatedWebpImage(file: File): Promise<boolean> {
  if (!isWebpImage(file)) return false

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WEBP') return false

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const chunkType = readAscii(bytes, offset, 4)
    const chunkLength = view.getUint32(offset + 4, true)
    const chunkDataOffset = offset + 8

    if (chunkType === 'ANIM') return true
    if (chunkType === 'VP8X' && chunkLength >= 1 && chunkDataOffset < bytes.length) {
      const featureFlags = bytes[chunkDataOffset] ?? 0
      if ((featureFlags & 0x02) !== 0) return true
    }

    offset = chunkDataOffset + chunkLength + (chunkLength % 2)
  }

  return false
}

export async function isAnimatedAvatarImage(file: File): Promise<boolean> {
  return isGifImage(file) || await isAnimatedPngImage(file) || await isAnimatedWebpImage(file)
}
