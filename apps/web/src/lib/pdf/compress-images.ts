// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import {
  PDFArray,
  PDFBool,
  PDFContext,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
} from 'pdf-lib'
import sharp from 'sharp'

const JPEG_QUALITY = 80

// 概ね200x200相当未満はアイコン・ロゴ等の非写真画像とみなし対象外にする
const MIN_PIXELS = 40_000

// 差し替えエンジンを容易に切り替えられるよう、入出力を Buffer のみに閉じたシグネチャにする。
// 実装の詳細（pdf-lib + sharp）は呼び出し側から一切見えない。
// 対象画像が無い場合や、再圧縮しても縮まらない場合は元の buffer をそのまま返す。
export async function compressPdfImages(buffer: Buffer): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(buffer, { updateMetadata: false })

  let modified = false
  for (const page of pdfDoc.getPages()) {
    const xobjects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)
    if (!xobjects) continue

    for (const [name, ref] of xobjects.entries()) {
      const stream = pdfDoc.context.lookupMaybe(ref, PDFStream)
      if (!(stream instanceof PDFRawStream)) continue
      const replaced = await recompressIfPhoto(pdfDoc, stream)
      if (replaced) {
        xobjects.set(name, replaced)
        // 差し替え後も古い画像オブジェクトが参照されないまま残ると save() でそのまま
        // 書き出されてしまい、圧縮したのにファイルサイズが増える結果になるため明示的に消す
        if (ref instanceof PDFRef) pdfDoc.context.delete(ref)
        modified = true
      }
    }
  }

  if (!modified) return buffer

  const bytes = await pdfDoc.save({ useObjectStreams: false })
  return Buffer.from(bytes)
}

// 写真スクショの貼り付けに合致する画像だけを対象にし、それ以外（アイコン・図形・
// 既にJPEG圧縮済みの画像・透過PNG等）は元のまま残す。マッチしなければ null を返す
async function recompressIfPhoto(doc: PDFDocument, stream: PDFRawStream): Promise<PDFRef | null> {
  const dict = stream.dict

  if (dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) return null
  if (dict.lookupMaybe(PDFName.of('ImageMask'), PDFBool)?.asBoolean()) return null

  // アルファ合成に依存している可能性があるため、透過画像はそのまま残す
  // （写真スクショの貼り付けは通常アルファを持たない）
  if (dict.get(PDFName.of('SMask')) || dict.get(PDFName.of('Mask'))) return null

  // 既にDCTDecode(JPEG)/JPXDecode等で圧縮済み、または複数フィルタのチェーンは対象外。
  // Filterが無い、またはFlateDecode単体（PNG由来の可逆圧縮の生データ）だけを狙う
  const filter = dict.get(PDFName.of('Filter'))
  if (filter && filter !== PDFName.of('FlateDecode')) return null

  const bpc = dict.lookupMaybe(PDFName.of('BitsPerComponent'), PDFNumber)?.asNumber()
  if (bpc !== 8) return null

  const width = dict.lookupMaybe(PDFName.of('Width'), PDFNumber)?.asNumber()
  const height = dict.lookupMaybe(PDFName.of('Height'), PDFNumber)?.asNumber()
  if (!width || !height || width * height < MIN_PIXELS) return null

  const channels = resolveChannels(dict, doc.context)
  if (!channels) return null

  const decoded = decodePDFRawStream(stream).decode()
  const pixelBytes = width * height * channels
  if (decoded.byteLength < pixelBytes) return null

  const raw = Buffer.from(decoded.buffer, decoded.byteOffset, pixelBytes)
  const jpeg = await sharp(raw, { raw: { width, height, channels: channels as 1 | 3 } })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer()

  // 再圧縮しても縮まらないなら差し替えない（PDFに既に格納されている生バイト数と比較）
  if (jpeg.byteLength >= stream.getContentsSize()) return null

  const embedded = await doc.embedJpg(jpeg)
  return embedded.ref
}

// DeviceGray/DeviceRGBに加え、PNG書き出しでよく使われるICCBasedカラースペース
// （実体はICCプロファイル付きの1〜4成分）まで見る。それ以外（Indexed/CMYK/Lab等）は
// 変換ロジックが複雑になるため今回のスコープ外として諦める
function resolveChannels(dict: PDFDict, context: PDFContext): 1 | 3 | null {
  const csRef = dict.get(PDFName.of('ColorSpace'))
  if (!csRef) return null

  const cs = context.lookup(csRef)
  if (cs === PDFName.of('DeviceGray')) return 1
  if (cs === PDFName.of('DeviceRGB')) return 3

  if (cs instanceof PDFArray && cs.size() >= 2 && cs.lookupMaybe(0, PDFName) === PDFName.of('ICCBased')) {
    const iccStream = cs.lookupMaybe(1, PDFRawStream)
    const n = iccStream?.dict.lookupMaybe(PDFName.of('N'), PDFNumber)?.asNumber()
    if (n === 1 || n === 3) return n
  }

  return null
}
