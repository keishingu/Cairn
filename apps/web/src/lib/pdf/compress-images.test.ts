// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// jsdom環境ではBufferがUint8Arrayのinstanceof判定を通らずpdf-libの型検証に失敗するため、
// DOM不要なこのテストファイルはNode環境で実行する
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream } from 'pdf-lib'
import sharp from 'sharp'
import { compressPdfImages } from './compress-images'

// 写真に近い、なめらかな連続階調のグラデーションの生ピクセルを生成する。単色画像はFlateだけで
// 既に十分小さく圧縮されてしまい、逆に完全なランダムノイズはJPEGが不得意とする高周波成分
// ばかりでFlateより悪化するため、どちらでもない「連続階調」を使う（実際の写真はこちらに近く、
// FlateよりDCT/JPEGの方が圧倒的に効率よく圧縮できる）
function buildPhotoLikePixels(width: number, height: number): Buffer {
  const pixels = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      pixels[i] = 128 + 100 * Math.sin(x / 18) * Math.cos(y / 24)
      pixels[i + 1] = 128 + 100 * Math.sin((x + 40) / 22) * Math.cos(y / 17)
      pixels[i + 2] = 128 + 100 * Math.sin(x / 15) * Math.cos((y + 30) / 20)
    }
  }
  return pixels
}

async function buildPhotoLikePng(width: number, height: number): Promise<Buffer> {
  const pixels = buildPhotoLikePixels(width, height)
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer()
}

async function buildPdfWithImage(pngBytes: Uint8Array): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const image = await doc.embedPng(pngBytes)
  const page = doc.addPage([image.width, image.height])
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
  return Buffer.from(await doc.save())
}

async function firstImageXObjectDict(buffer: Buffer): Promise<PDFDict> {
  const doc = await PDFDocument.load(buffer)
  const xobjects = doc.getPages()[0]!.node.Resources()!.lookupMaybe(PDFName.of('XObject'), PDFDict)!
  const [, ref] = xobjects.entries()[0]!
  const stream = doc.context.lookupMaybe(ref, PDFStream)
  if (!(stream instanceof PDFRawStream)) throw new Error('image stream not found')
  return stream.dict
}

describe('compressPdfImages', () => {
  it('十分大きい写真らしきPNG画像をJPEGへ再圧縮し、ファイルサイズを縮める', async () => {
    const png = await buildPhotoLikePng(400, 400)
    const pdf = await buildPdfWithImage(png)

    const compressed = await compressPdfImages(pdf)

    expect(compressed.byteLength).toBeLessThan(pdf.byteLength)

    const dict = await firstImageXObjectDict(compressed)
    expect(dict.get(PDFName.of('Filter'))).toBe(PDFName.of('DCTDecode'))
  })

  it('小さい画像（アイコン等の想定）は対象外のまま変更しない', async () => {
    const png = await buildPhotoLikePng(50, 50)
    const pdf = await buildPdfWithImage(png)

    const compressed = await compressPdfImages(pdf)

    expect(compressed).toBe(pdf)
    const dict = await firstImageXObjectDict(compressed)
    expect(dict.get(PDFName.of('Filter'))).toBe(PDFName.of('FlateDecode'))
  })

  it('透過(アルファ)を持つ画像は対象外のまま変更しない', async () => {
    const width = 400
    const height = 400
    const rgba = Buffer.alloc(width * height * 4)
    for (let i = 0; i < rgba.length; i++) rgba[i] = Math.floor(Math.random() * 256)
    const png = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer()
    const pdf = await buildPdfWithImage(png)

    const compressed = await compressPdfImages(pdf)

    expect(compressed).toBe(pdf)
  })

  it('画像を含まないPDFはそのまま返す', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([200, 200])
    const pdf = Buffer.from(await doc.save())

    const compressed = await compressPdfImages(pdf)

    expect(compressed).toBe(pdf)
  })

  it('複数ページから同じ画像オブジェクトが共有されていても、両方とも参照切れにならず差し替わる', async () => {
    const png = await buildPhotoLikePng(400, 400)
    const doc = await PDFDocument.create()
    const image = await doc.embedPng(png)
    const page1 = doc.addPage([image.width, image.height])
    page1.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
    const page2 = doc.addPage([image.width, image.height])
    page2.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
    const pdf = Buffer.from(await doc.save())

    const compressed = await compressPdfImages(pdf)

    const loaded = await PDFDocument.load(compressed)
    for (const page of loaded.getPages()) {
      const xobjects = page.node.Resources()!.lookupMaybe(PDFName.of('XObject'), PDFDict)!
      const [, ref] = xobjects.entries()[0]!
      const stream = loaded.context.lookupMaybe(ref, PDFStream)
      expect(stream).toBeInstanceOf(PDFRawStream)
      expect((stream as PDFRawStream).dict.get(PDFName.of('Filter'))).toBe(PDFName.of('DCTDecode'))
    }
  })

  it('DecodeParmsにPredictorが指定された画像（PNG/TIFF予測符号化）は対象外のまま変更しない', async () => {
    const width = 400
    const height = 400
    const doc = await PDFDocument.create()
    const pixels = buildPhotoLikePixels(width, height)

    const imageRef = doc.context.register(
      doc.context.flateStream(pixels, {
        Type: 'XObject',
        Subtype: 'Image',
        Width: width,
        Height: height,
        BitsPerComponent: 8,
        ColorSpace: 'DeviceRGB',
        DecodeParms: { Predictor: 15, Colors: 3, BitsPerComponent: 8, Columns: width },
      }),
    )
    const page = doc.addPage([width, height])
    page.node.newXObject('Im1', imageRef)
    const pdf = Buffer.from(await doc.save())

    const compressed = await compressPdfImages(pdf)

    expect(compressed).toBe(pdf)
  })

  it('宣言された画像サイズが上限を超える場合、インフレートせず対象外にする', async () => {
    const width = 10_000
    const height = 10_000 // width*height = 1億px > MAX_PIXELS
    const doc = await PDFDocument.create()
    // 実データは小さいダミーで十分（上限チェックはWidth/Heightの申告値だけで判定するため）
    const dummy = Buffer.from([0, 0, 0])

    const imageRef = doc.context.register(
      doc.context.flateStream(dummy, {
        Type: 'XObject',
        Subtype: 'Image',
        Width: width,
        Height: height,
        BitsPerComponent: 8,
        ColorSpace: 'DeviceRGB',
      }),
    )
    const page = doc.addPage([100, 100])
    page.node.newXObject('Im1', imageRef)
    const pdf = Buffer.from(await doc.save())

    const compressed = await compressPdfImages(pdf)

    expect(compressed).toBe(pdf)
  })

  it('非デフォルトのDecode配列を持つ画像は対象外のまま変更しない', async () => {
    const width = 400
    const height = 400
    const doc = await PDFDocument.create()
    const pixels = buildPhotoLikePixels(width, height)

    const imageRef = doc.context.register(
      doc.context.flateStream(pixels, {
        Type: 'XObject',
        Subtype: 'Image',
        Width: width,
        Height: height,
        BitsPerComponent: 8,
        ColorSpace: 'DeviceRGB',
        Decode: [1, 0, 1, 0, 1, 0],
      }),
    )
    const page = doc.addPage([width, height])
    page.node.newXObject('Im1', imageRef)
    const pdf = Buffer.from(await doc.save())

    const compressed = await compressPdfImages(pdf)

    expect(compressed).toBe(pdf)
  })
})
