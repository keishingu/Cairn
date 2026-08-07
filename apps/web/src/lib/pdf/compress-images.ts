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

// 概ね8000x5000相当を超える場合、宣言サイズ詐称によるサーバーレスワーカーの
// OOMを避けるため対象外にする（インフレート前にWidth/Heightの申告値だけで判定できる）
const MAX_PIXELS = 40_000_000

// 差し替えエンジンを容易に切り替えられるよう、入出力を Buffer のみに閉じたシグネチャにする。
// 実装の詳細（pdf-lib + sharp）は呼び出し側から一切見えない。
// 対象画像が無い場合や、再圧縮しても縮まらない場合は元の buffer をそのまま返す。
export async function compressPdfImages(buffer: Buffer): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(buffer, { updateMetadata: false })

  // 同じ画像オブジェクトが複数ページ・複数リソース名から参照されることがあるため、
  // 差し替え要否は参照(ref)ごとに一度だけ判定し、参照している箇所を全て書き換えてから
  // 元のオブジェクトを削除する。参照箇所を一部だけ書き換えて即座に削除すると、
  // 残りの箇所が存在しないオブジェクトを指したまま（参照切れ）になってしまう
  const locationsByRef = new Map<PDFRef, { dict: PDFDict; name: PDFName }[]>()

  for (const page of pdfDoc.getPages()) {
    const xobjects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)
    if (!xobjects) continue

    for (const [name, ref] of xobjects.entries()) {
      if (!(ref instanceof PDFRef)) continue
      const locations = locationsByRef.get(ref) ?? []
      locations.push({ dict: xobjects, name })
      locationsByRef.set(ref, locations)
    }
  }

  let modified = false
  for (const [ref, locations] of locationsByRef) {
    const stream = pdfDoc.context.lookupMaybe(ref, PDFStream)
    if (!(stream instanceof PDFRawStream)) continue

    const replaced = await recompressIfPhoto(pdfDoc, stream)
    if (!replaced) continue

    for (const { dict, name } of locations) dict.set(name, replaced)
    pdfDoc.context.delete(ref)
    modified = true
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

  // DecodeParmsにPredictor(PNG/TIFFの予測符号化)が指定されている場合、
  // インフレート後のバイト列はまだ生のピクセル値ではなくスキャンライン単位で
  // 予測符号化されたままなので、rawピクセルとして扱うと壊れた画像になる。
  // 復号ロジックは未対応のため対象外にする
  const decodeParms = doc.context.lookupMaybe(dict.get(PDFName.of('DecodeParms')), PDFDict)
  const predictor = decodeParms?.lookupMaybe(PDFName.of('Predictor'), PDFNumber)?.asNumber()
  if (predictor && predictor !== 1) return null

  // 非デフォルトの/Decodeはサンプル値の再マッピング（階調反転等）を意味し、単純にJPEG化すると
  // 見た目が変わってしまう。判定コストに見合わないため、指定があれば一律で対象外にする
  if (dict.get(PDFName.of('Decode'))) return null

  const bpc = dict.lookupMaybe(PDFName.of('BitsPerComponent'), PDFNumber)?.asNumber()
  if (bpc !== 8) return null

  const width = dict.lookupMaybe(PDFName.of('Width'), PDFNumber)?.asNumber()
  const height = dict.lookupMaybe(PDFName.of('Height'), PDFNumber)?.asNumber()
  if (!width || !height) return null

  const pixels = width * height
  if (pixels < MIN_PIXELS || pixels > MAX_PIXELS) return null

  const channels = resolveChannels(dict, doc.context)
  if (!channels) return null

  // ここまでの時点で申告サイズは上限内と確認済みなので、ここで初めてインフレートする
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
