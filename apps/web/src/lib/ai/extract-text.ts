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
  return text.replace(/&amp;|&lt;|&gt;|&quot;|&apos;|&#x([0-9a-fA-F]+);|&#(\d+);/g, (m, hex, dec) => {
    if (hex !== undefined) return codePointToString(parseInt(hex, 16), m)
    if (dec !== undefined) return codePointToString(parseInt(dec, 10), m)
    return XML_ENTITIES[m] ?? m
  })
}

// 不正な参照(範囲外のコードポイント等)で例外にせず、元の文字列をそのまま残す
function codePointToString(codePoint: number, fallback: string): string {
  try {
    return String.fromCodePoint(codePoint)
  } catch {
    return fallback
  }
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

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Excel は文字列セルの本文を xl/sharedStrings.xml にまとめて持ち、各シートのセルは t="s" のとき
// その通し番号を持つ。シート名は xl/workbook.xml の並び順、実体のファイルは rels で解決する。
// 書式や数式は捨て、表示に近い値（数式は計算済みの値）をタブ区切りの行にする。
// 利用者が上げたファイルをそのまま読むため、展開後のサイズ・シート数・取り出す文字数に上限を設け、
// XML は正規表現の後戻りではなく indexOf で前へ進むだけの走査にする（閉じタグのない XML で処理時間が膨らまないように）
const XLSX_MAX_ENTRY_BYTES = 30 * 1024 * 1024
const XLSX_MAX_TOTAL_BYTES = 100 * 1024 * 1024
const XLSX_MAX_SHEETS = 50
/** 取り出す文字数の上限。AI に渡すのは先頭5万文字までなので、それより十分に長くなったら読むのをやめる */
const XLSX_MAX_OUTPUT_CHARS = 200_000

class XlsxReader {
  private readBytes = 0
  constructor(private readonly zip: JSZip) {}

  async read(path: string): Promise<string | null> {
    const file = this.zip.files[path]
    if (!file) return null
    // 展開前に、ZIP のディレクトリに書かれた展開後のサイズで弾く（圧縮爆弾を展開しない）
    const size = (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0
    this.readBytes += size
    if (size > XLSX_MAX_ENTRY_BYTES || this.readBytes > XLSX_MAX_TOTAL_BYTES) {
      throw new Error('xlsx entry is too large to extract')
    }
    const text = await file.async('text')
    // サイズの記載が実際と違っても、展開した長さで確かめ直す
    if (text.length > XLSX_MAX_ENTRY_BYTES) throw new Error('xlsx entry is too large to extract')
    return text
  }
}

/** xml の from 以降にある <tag ...>…</tag> を順に返す（自己終了の <tag/> は body を空にする）。見つからなければ打ち切る */
function* scanElements(xml: string, tag: string, from = 0, to = xml.length): Generator<{ attrs: string; body: string }> {
  const open = `<${tag}`
  const close = `</${tag}>`
  let index = from
  while (index < to) {
    const start = xml.indexOf(open, index)
    if (start === -1 || start >= to) return
    const next = xml[start + open.length]
    // <c と <col のように前方一致する別の要素は飛ばす
    if (next !== '>' && next !== '/' && next !== ' ' && next !== '\t' && next !== '\n' && next !== '\r') {
      index = start + open.length
      continue
    }
    const tagEnd = xml.indexOf('>', start)
    if (tagEnd === -1 || tagEnd >= to) return
    if (xml[tagEnd - 1] === '/') {
      yield { attrs: xml.slice(start + open.length, tagEnd - 1), body: '' }
      index = tagEnd + 1
      continue
    }
    const end = xml.indexOf(close, tagEnd + 1)
    if (end === -1 || end > to) return
    yield { attrs: xml.slice(start + open.length, tagEnd), body: xml.slice(tagEnd + 1, end) }
    index = end + close.length
  }
}

function textRuns(body: string): string {
  let text = ''
  for (const { body: run } of scanElements(body, 't')) text += decodeXmlEntities(run)
  return text
}

async function extractXlsxText(buffer: Buffer): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)
  const reader = new XlsxReader(zip)
  const sharedXml = await reader.read('xl/sharedStrings.xml')
  const sharedStrings: string[] = []
  if (sharedXml) for (const { body } of scanElements(sharedXml, 'si')) sharedStrings.push(textRuns(body))

  const parts: string[] = []
  let length = 0
  for (const sheet of (await resolveSheets(zip, reader)).slice(0, XLSX_MAX_SHEETS)) {
    if (length >= XLSX_MAX_OUTPUT_CHARS) break
    const xml = await reader.read(sheet.path)
    if (!xml) continue
    const rows: string[] = []
    for (const { body: rowBody } of scanElements(xml, 'row')) {
      if (length >= XLSX_MAX_OUTPUT_CHARS) break
      const cells: string[] = []
      for (const { attrs, body } of scanElements(rowBody, 'c')) {
        const type = attrs.match(/\bt="([^"]*)"/)?.[1]
        if (type === 'inlineStr') {
          cells.push(textRuns(body))
          continue
        }
        const value = scanElements(body, 'v').next().value?.body
        if (value === undefined) cells.push('')
        else if (type === 's') cells.push(sharedStrings[Number(value)] ?? '')
        else cells.push(decodeXmlEntities(value))
      }
      const row = cells.join('\t').replace(/\t+$/, '')
      if (row.length === 0) continue
      rows.push(row)
      length += row.length + 1
    }
    if (rows.length > 0) parts.push(`# ${sheet.name}\n${rows.join('\n')}`)
  }
  return parts.join('\n\n')
}

async function resolveSheets(zip: JSZip, reader: XlsxReader): Promise<Array<{ name: string; path: string }>> {
  const workbookXml = await reader.read('xl/workbook.xml')
  const relsXml = await reader.read('xl/_rels/workbook.xml.rels')
  if (workbookXml && relsXml) {
    const targetById = new Map<string, string>()
    for (const { attrs } of scanElements(relsXml, 'Relationship')) {
      const id = attrs.match(/\bId="([^"]+)"/)?.[1]
      const target = attrs.match(/\bTarget="([^"]+)"/)?.[1]
      if (id && target) targetById.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`)
    }
    // 同じシートの実体を何度も指して読ませる（同じ本文を繰り返し取り出させる）ファイルは、1回だけ読む
    const seen = new Set<string>()
    const sheets: Array<{ name: string; path: string }> = []
    for (const { attrs } of scanElements(workbookXml, 'sheet')) {
      const name = attrs.match(/\bname="([^"]*)"/)?.[1]
      const rId = attrs.match(/\br:id="([^"]+)"/)?.[1]
      const path = rId ? targetById.get(rId) : undefined
      if (name === undefined || !path || seen.has(path)) continue
      seen.add(path)
      sheets.push({ name: decodeXmlEntities(name), path })
    }
    if (sheets.length > 0) return sheets
  }
  // 解決できない場合（壊れたファイル等）はファイル名の連番で読む
  return Object.keys(zip.files)
    .filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/sheet(\d+)/)?.[1] ?? 0) - Number(b.match(/sheet(\d+)/)?.[1] ?? 0))
    .map((path, index) => ({ name: `Sheet${index + 1}`, path }))
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

  // Excel は AIアシスタントの添付でだけ読む（ファイル一覧のインデックス対象 isIndexable には入れていない）
  if (mimeType === XLSX_MIME_TYPE) {
    return extractXlsxText(buffer)
  }

  if (mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType === 'text/csv') {
    return decodeTextBuffer(buffer)
  }

  throw new Error(`Unsupported MIME type for text extraction: ${mimeType}`)
}

// 日本語Windows版Excelが書き出すCSVはデフォルトでShift_JIS(CP932)であり、UTF-8前提で
// デコードすると文字化けする。fatal:trueのTextDecoderは不正なUTF-8バイト列で例外を
// 投げる(=有効なUTF-8がたまたまU+FFFDを含む場合と、真にデコード不能な場合を区別できる)
// ため、それをもってCP932へフォールバックする。TextDecoderは既定で先頭のUTF-8 BOMも
// 自動的に取り除く。
async function decodeTextBuffer(buffer: Buffer): Promise<string> {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    const iconv = await import('iconv-lite')
    return iconv.decode(buffer, 'Shift_JIS')
  }
}
