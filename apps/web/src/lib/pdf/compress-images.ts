// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import {
  PDFBool,
  PDFArray,
  PDFContext,
  PDFDict,
  PDFDocument,
  EncryptedPDFError,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
} from 'pdf-lib'
import { inflateSync } from 'node:zlib'
import sharp from 'sharp'

const JPEG_QUALITY = 80

// 概ね200x200相当未満はアイコン・ロゴ等の非写真画像とみなし対象外にする
const MIN_PIXELS = 40_000

// 概ね8000x5000相当を超える場合、宣言サイズ詐称によるサーバーレスワーカーの
// OOMを避けるため対象外にする（インフレート前にWidth/Heightの申告値だけで判定できる）
const MAX_PIXELS = 40_000_000

// JPEG's dimension limit (JPEG_MAX_DIMENSION in libjpeg) is lower than the
// pixel-count limit for very wide or tall images.
const MAX_JPEG_DIMENSION = 65_500

// 差し替えエンジンを容易に切り替えられるよう、入出力を Buffer のみに閉じたシグネチャにする。
// 実装の詳細（pdf-lib + sharp）は呼び出し側から一切見えない。
// 対象画像が無い場合や、再圧縮しても縮まらない場合は元の buffer をそのまま返す。
export async function compressPdfImages(buffer: Buffer): Promise<Buffer> {
  let pdfDoc: PDFDocument
  try {
    pdfDoc = await PDFDocument.load(buffer, { updateMetadata: false })
  } catch (error) {
    // pdf-lib cannot safely rewrite an encrypted document. Preserve its original
    // bytes so permission-only encrypted PDFs remain downloadable unchanged.
    // pdf-lib's EncryptedPDFError inherits Error without setting its name, so
    // its message is the stable discriminator when ESM/CJS copies differ.
    if (
      error instanceof EncryptedPDFError ||
      (error instanceof Error && error.message.startsWith('Input document to `PDFDocument.load` is encrypted.'))
    ) return buffer
    throw error
  }

  // 参照(ref)ごとに一度だけ処理する。元ref自体を差し替えることで、ページ外や
  // Form XObject 内など、列挙できない共有参照も維持する。
  const imageRefs = new Set<PDFRef>()

  for (const page of pdfDoc.getPages()) {
    const xobjects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)
    if (!xobjects) continue

    for (const [, ref] of xobjects.entries()) {
      if (!(ref instanceof PDFRef)) continue
      imageRefs.add(ref)
    }
  }

  let modified = false
  for (const ref of imageRefs) {
    const stream = pdfDoc.context.lookupMaybe(ref, PDFStream)
    if (!(stream instanceof PDFRawStream)) continue

    const replaced = await recompressIfPhoto(pdfDoc, stream)
    if (!replaced) continue

    // embedJpg は別refに画像ストリームを登録する。既存refへ内容を割り当ててから
    // 新refを消し、ネストされた参照を含む全ての利用箇所を保つ。
    const replacement = pdfDoc.context.lookup(replaced, PDFStream)
    pdfDoc.context.assign(ref, replacement)
    pdfDoc.context.delete(replaced)
    modified = true
  }

  if (!modified) return buffer

  const bytes = await pdfDoc.save({ useObjectStreams: false })
  return bytes.byteLength < buffer.byteLength ? Buffer.from(bytes) : buffer
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
  if (
    typeof width !== 'number' || typeof height !== 'number' ||
    !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
    width > MAX_JPEG_DIMENSION || height > MAX_JPEG_DIMENSION
  ) return null

  const pixels = width * height
  if (pixels < MIN_PIXELS || pixels > MAX_PIXELS) return null

  const colorSpace = resolveColorSpace(dict, doc.context)
  if (!colorSpace) return null
  const { channels } = colorSpace

  // ここまでの時点で申告サイズは上限内と確認済みなので、ここで初めてインフレートする
  const pixelBytes = width * height * channels
  if (!Number.isSafeInteger(pixelBytes)) return null
  let decoded: Buffer
  try {
    decoded = filter
      ? inflateSync(stream.contents, { maxOutputLength: pixelBytes })
      : Buffer.from(stream.contents)
  } catch {
    return null
  }
  if (decoded.byteLength !== pixelBytes) return null

  const raw = decoded
  const encoder = sharp(raw, { raw: { width, height, channels: channels as 1 | 3 } })
  if (channels === 1) encoder.greyscale().toColourspace('b-w')
  const jpeg = await encoder.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer()

  // 再圧縮しても縮まらないなら差し替えない（PDFに既に格納されている生バイト数と比較）
  if (jpeg.byteLength >= stream.getContentsSize()) return null

  const embedded = await doc.embedJpg(jpeg)
  // PDFDocument.flush() が通常行う埋め込みをここで先に完了させ、既存refへ
  // 割り当てるストリームが context に登録済みであることを保証する。
  await embedded.embed()
  if (colorSpace.iccBased) {
    // embedJpg emits DeviceGray/DeviceRGB. Keep the source ICCBased color space
    // attached to the JPEG samples so its profile continues to define their color.
    const replacement = doc.context.lookup(embedded.ref, PDFStream)
    replacement.dict.set(PDFName.of('ColorSpace'), colorSpace.original)
  }
  return embedded.ref
}

// ICCBased samples can be JPEG-encoded without color conversion when the JPEG
// component count matches /N; retain the original color-space object on output.
function resolveColorSpace(
  dict: PDFDict,
  context: PDFContext,
): { channels: 1 | 3; iccBased: boolean; original: NonNullable<ReturnType<PDFDict['get']>> } | null {
  const csRef = dict.get(PDFName.of('ColorSpace'))
  if (!csRef) return null

  const cs = context.lookup(csRef)
  if (cs === PDFName.of('DeviceGray')) return { channels: 1, iccBased: false, original: csRef }
  if (cs === PDFName.of('DeviceRGB')) return { channels: 3, iccBased: false, original: csRef }

  if (cs instanceof PDFArray && cs.size() === 2 && cs.get(0) === PDFName.of('ICCBased')) {
    const profile = context.lookupMaybe(cs.get(1), PDFStream)
    const channels = profile?.dict.lookupMaybe(PDFName.of('N'), PDFNumber)?.asNumber()
    if (channels === 1 || channels === 3) {
      return { channels, iccBased: true, original: csRef }
    }
  }

  return null
}
