// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

const CHUNK_CHARS = 1600  // ~400 tokens (4 chars/token)
const OVERLAP_CHARS = 200 // ~50 tokens overlap

export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (normalized.length === 0) return []
  if (normalized.length <= CHUNK_CHARS) return [normalized]

  const chunks: string[] = []
  let start = 0

  while (start < normalized.length) {
    let end = start + CHUNK_CHARS

    if (end < normalized.length) {
      // 段落 > 文末（。） > 改行 の順で自然な区切りを探す
      const searchFrom = start + Math.floor(CHUNK_CHARS / 2)
      const para = normalized.lastIndexOf('\n\n', end)
      const sentence = normalized.lastIndexOf('。', end)
      const line = normalized.lastIndexOf('\n', end)

      const boundary = Math.max(
        para > searchFrom ? para : -1,
        sentence > searchFrom ? sentence : -1,
        line > searchFrom ? line : -1,
      )
      if (boundary > -1) end = boundary + 1
    }

    const chunk = normalized.slice(start, end).trim()
    if (chunk.length > 0) chunks.push(chunk)
    start = end - OVERLAP_CHARS
  }

  return chunks
}
