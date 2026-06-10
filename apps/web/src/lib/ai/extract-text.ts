// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

const INDEXABLE_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
])

export function isIndexable(mimeType: string): boolean {
  return INDEXABLE_MIME_TYPES.has(mimeType)
}

export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    const pdfParse = await import('pdf-parse')
    const parse = (pdfParse.default ?? pdfParse) as (buf: Buffer) => Promise<{ text: string }>
    const result = await parse(buffer)
    return result.text
  }

  if (
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
    return buffer.toString('utf-8')
  }

  throw new Error(`Unsupported MIME type for text extraction: ${mimeType}`)
}
