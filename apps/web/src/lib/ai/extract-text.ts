// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type JSZip from 'jszip'

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

  const slideNames = await resolveSlideOrder(zip)

  const slideTexts = await Promise.all(slideNames.map(async name => {
    const file = zip.files[name]
    if (!file) return ''
    const xml = await file.async('text')
    return extractParagraphsFromSlideXml(xml)
  }))

  return slideTexts.join('\n')
}

function slideFileNamesByFilenameNumber(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      const numB = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      return numA - numB
    })
}

// slideN.xml のファイル名連番はパッケージ内部の識別子に過ぎず、スライドを並び替えても
// 変わらない。実際の表示順は ppt/presentation.xml の <p:sldIdLst> が持つ r:id の並びを
// ppt/_rels/presentation.xml.rels で slide ファイルに解決して初めて分かる。
// 解決できない場合(壊れたファイル等)はファイル名連番にフォールバックする。
async function resolveSlideOrder(zip: JSZip): Promise<string[]> {
  const presentationFile = zip.files['ppt/presentation.xml']
  const relsFile = zip.files['ppt/_rels/presentation.xml.rels']
  if (!presentationFile || !relsFile) return slideFileNamesByFilenameNumber(zip)

  const presentationXml = await presentationFile.async('text')
  const relsXml = await relsFile.async('text')

  const orderedRIds = [...presentationXml.matchAll(/<p:sldId\b[^>]*\/?>/g)]
    .map(([tag]) => tag.match(/\br:id="([^"]+)"/)?.[1])
    .filter((id): id is string => !!id)
  if (orderedRIds.length === 0) return slideFileNamesByFilenameNumber(zip)

  const targetById = new Map<string, string>()
  for (const [tag] of relsXml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const id = tag.match(/\bId="([^"]+)"/)?.[1]
    const target = tag.match(/\bTarget="([^"]+)"/)?.[1]
    if (id && target) targetById.set(id, target)
  }

  const orderedNames = orderedRIds
    .map(rId => targetById.get(rId))
    .filter((target): target is string => !!target)
    .map(target => (target.startsWith('/') ? target.slice(1) : `ppt/${target}`))
    .filter(name => /slide\d+\.xml$/.test(name))

  return orderedNames.length > 0 ? orderedNames : slideFileNamesByFilenameNumber(zip)
}

// <a:p>(段落)内の<a:r>(ラン)はフォーマット変更のたびに分割されており、
// 文字列内に必要なスペースは既に含まれているため、ラン同士はスペースを挟まず連結する。
// 段落内の手動改行(<a:br>)・タブ(<a:tab>)はラン間の要素として現れるため、
// 見た目通りの区切り文字に変換してから連結する。段落自体の区切りは改行として扱う。
function extractParagraphsFromSlideXml(xml: string): string {
  const paragraphs = [...xml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g)].map(([, body]) => {
    const tokens = [...(body ?? '').matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>|<a:br\b[^>]*\/?>|<a:tab\b[^>]*\/?>/g)]
    return tokens.map(m => {
      if (m[1] !== undefined) return decodeXmlEntities(m[1])
      if (m[0].startsWith('<a:br')) return '\n'
      return '\t'
    }).join('')
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
    return decodeTextBuffer(buffer)
  }

  throw new Error(`Unsupported MIME type for text extraction: ${mimeType}`)
}

// 日本語Windows版Excelが書き出すCSVはデフォルトでShift_JIS(CP932)であり、UTF-8前提で
// デコードすると文字化け(U+FFFDへの置換)する。BOM付きUTF-8はそのまま扱い、
// BOM無しでUTF-8として不正なバイト列(U+FFFDを含む)が出た場合のみCP932として再デコードする。
async function decodeTextBuffer(buffer: Buffer): Promise<string> {
  const hasUtf8Bom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
  if (hasUtf8Bom) return buffer.subarray(3).toString('utf-8')

  const utf8 = buffer.toString('utf-8')
  const REPLACEMENT_CHAR = String.fromCharCode(0xfffd)
  if (!utf8.includes(REPLACEMENT_CHAR)) return utf8

  const iconv = await import('iconv-lite')
  return iconv.decode(buffer, 'Shift_JIS')
}
