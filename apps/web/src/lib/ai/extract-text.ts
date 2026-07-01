// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

const INDEXABLE_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
])

export function isIndexable(mimeType: string): boolean {
  return INDEXABLE_MIME_TYPES.has(mimeType)
}

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
}

function decodeXmlEntities(text: string): string {
  return text.replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, m => XML_ENTITIES[m] ?? m)
}

async function extractPptxText(buffer: Buffer): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)

  const slideEntries = Object.entries(zip.files)
    .filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort(([a], [b]) => {
      const numA = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      const numB = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      return numA - numB
    })

  const slideTexts = await Promise.all(slideEntries.map(async ([, file]) => {
    const xml = await file.async('text')
    return extractParagraphsFromSlideXml(xml)
  }))

  return slideTexts.join('\n')
}

// <a:p>(段落)内の<a:r>(ラン)はフォーマット変更のたびに分割されており、
// 文字列内に必要なスペースは既に含まれているため、ラン同士はスペースを挟まず連結する。
// 段落の区切りだけを改行として扱う。
function extractParagraphsFromSlideXml(xml: string): string {
  const paragraphs = [...xml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g)].map(([, body]) => {
    const runs = [...(body ?? '').matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)].map(m => decodeXmlEntities(m[1] ?? ''))
    return runs.join('')
  })
  return paragraphs.join('\n')
}

export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    // エントリ (pdf-parse) ではなく本体実装を直接読み込む。
    // index.js には module.parent が無い環境でテスト用PDFを読むデバッグコードがあり、
    // サーバーレスのバンドルだと ENOENT (./test/data/05-versions-space.pdf) で落ちるため。
    const { default: parse } = await import('pdf-parse/lib/pdf-parse.js')
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

  if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    return extractPptxText(buffer)
  }

  if (mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType === 'text/csv') {
    return buffer.toString('utf-8')
  }

  throw new Error(`Unsupported MIME type for text extraction: ${mimeType}`)
}
