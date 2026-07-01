// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { extractText, isIndexable } from './extract-text'

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

// slides[slideIndex][paragraphIndex][runIndex] = ランのテキスト
async function buildFakePptx(slides: string[][][]): Promise<Buffer> {
  const zip = new JSZip()
  slides.forEach((paragraphs, i) => {
    const bodyXml = paragraphs.map(runs => {
      const runXml = runs.map(t => `<a:r><a:t>${t}</a:t></a:r>`).join('')
      return `<a:p>${runXml}</a:p>`
    }).join('')
    zip.file(
      `ppt/slides/slide${i + 1}.xml`,
      `<?xml version="1.0"?><p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:sp><p:txBody>${bodyXml}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    )
  })
  const buf = await zip.generateAsync({ type: 'nodebuffer' })
  return buf
}

describe('isIndexable', () => {
  it('PowerPoint (pptx) と CSV を検索対象として扱う', () => {
    expect(isIndexable(PPTX_MIME)).toBe(true)
    expect(isIndexable('text/csv')).toBe(true)
  })

  it('未対応の形式は検索対象外', () => {
    expect(isIndexable('application/zip')).toBe(false)
  })
})

describe('extractText', () => {
  it('pptxの各スライド・段落からテキストを抽出し、改行区切りで結合する', async () => {
    const buffer = await buildFakePptx([
      [['見出し'], ['本文1行目']],
      [['2枚目のスライド']],
    ])

    const text = await extractText(buffer, PPTX_MIME)

    expect(text).toBe('見出し\n本文1行目\n2枚目のスライド')
  })

  it('同一段落内で書式変更により分割されたランは、スペースを挿入せず連結する', async () => {
    const buffer = await buildFakePptx([[['pro', 'ject']]])

    const text = await extractText(buffer, PPTX_MIME)

    expect(text).toBe('project')
  })

  it('pptx内のXMLエンティティをデコードする', async () => {
    const buffer = await buildFakePptx([[['A &amp; B &lt;test&gt;']]])

    const text = await extractText(buffer, PPTX_MIME)

    expect(text).toBe('A & B <test>')
  })

  it('xml:space="preserve"属性付きの<a:t>も取りこぼさない', async () => {
    const zip = new JSZip()
    zip.file(
      'ppt/slides/slide1.xml',
      '<?xml version="1.0"?><p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:sp><p:txBody><a:p>'
      + '<a:r><a:t xml:space="preserve">先頭に空白  </a:t></a:r>'
      + '</a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
    )
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    const text = await extractText(buffer, PPTX_MIME)

    expect(text).toBe('先頭に空白  ')
  })

  it('CSVはそのままテキストとして返す', async () => {
    const buffer = Buffer.from('name,age\n太郎,30', 'utf-8')

    const text = await extractText(buffer, 'text/csv')

    expect(text).toBe('name,age\n太郎,30')
  })
})
