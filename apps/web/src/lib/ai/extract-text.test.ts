// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import iconv from 'iconv-lite'
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

  it('pptx内の数値文字参照(10進・16進)もデコードする', async () => {
    const buffer = await buildFakePptx([[['don&#8217;t &#x2019;test&#x2019; a&#160;b']]])

    const text = await extractText(buffer, PPTX_MIME)

    expect(text).toBe('don’t ’test’ a b')
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

  it('同一段落内の手動改行(<a:br>)は区切り文字として扱い、単語同士を連結しない', async () => {
    const zip = new JSZip()
    zip.file(
      'ppt/slides/slide1.xml',
      '<?xml version="1.0"?><p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:sp><p:txBody><a:p>'
      + '<a:r><a:t>Q1</a:t></a:r><a:br><a:rPr lang="en-US"/></a:br><a:r><a:t>Revenue</a:t></a:r>'
      + '</a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
    )
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    const text = await extractText(buffer, PPTX_MIME)

    expect(text).toBe('Q1\nRevenue')
  })

  it('同一段落内のタブ(<a:tab>)は区切り文字として扱う', async () => {
    const zip = new JSZip()
    zip.file(
      'ppt/slides/slide1.xml',
      '<?xml version="1.0"?><p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:sp><p:txBody><a:p>'
      + '<a:r><a:t>Q1</a:t></a:r><a:tab/><a:r><a:t>Revenue</a:t></a:r>'
      + '</a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
    )
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    const text = await extractText(buffer, PPTX_MIME)

    expect(text).toBe('Q1\tRevenue')
  })

  it('スライドが並び替えられている場合、ファイル名の連番ではなくpresentation.xmlの表示順で抽出する', async () => {
    const zip = new JSZip()
    const slideXml = (text: string) =>
      `<?xml version="1.0"?><p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`

    // ファイル名はslide1→slide2の順だが、表示順(sldIdLst)はrId2(slide2)→rId1(slide1)
    zip.file('ppt/slides/slide1.xml', slideXml('スライドA'))
    zip.file('ppt/slides/slide2.xml', slideXml('スライドB'))
    zip.file(
      'ppt/presentation.xml',
      '<?xml version="1.0"?><p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst>'
      + '<p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/>'
      + '</p:sldIdLst></p:presentation>',
    )
    zip.file(
      'ppt/_rels/presentation.xml.rels',
      '<?xml version="1.0"?><Relationships>'
      + '<Relationship Id="rId1" Type="slide" Target="slides/slide1.xml"/>'
      + '<Relationship Id="rId2" Type="slide" Target="slides/slide2.xml"/>'
      + '</Relationships>',
    )
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    const text = await extractText(buffer, PPTX_MIME)

    expect(text).toBe('スライドB\nスライドA')
  })

  it('CSVはそのままテキストとして返す', async () => {
    const buffer = Buffer.from('name,age\n太郎,30', 'utf-8')

    const text = await extractText(buffer, 'text/csv')

    expect(text).toBe('name,age\n太郎,30')
  })

  it('日本語Windows版ExcelがShift_JIS(CP932)で書き出したCSVも文字化けせず読める', async () => {
    const buffer = iconv.encode('name,age\n太郎,30', 'Shift_JIS')

    const text = await extractText(buffer, 'text/csv')

    expect(text).toBe('name,age\n太郎,30')
  })

  it('BOM付きUTF-8のCSVはBOMを除いてそのまま読める', async () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf])
    const buffer = Buffer.concat([bom, Buffer.from('name,age\n太郎,30', 'utf-8')])

    const text = await extractText(buffer, 'text/csv')

    expect(text).toBe('name,age\n太郎,30')
  })

  it('有効なUTF-8がU+FFFD(置換文字)自体を含む場合、CP932への誤フォールバックで文字化けさせない', async () => {
    const buffer = Buffer.from('name,note\n太郎,�', 'utf-8')

    const text = await extractText(buffer, 'text/csv')

    expect(text).toBe('name,note\n太郎,�')
  })

  it('Excel はシートの並び順に、共有文字列・インライン文字列・数値をタブ区切りの行で取り出す', async () => {
    const zip = new JSZip()
    zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="予算 &amp; 実績" sheetId="2" r:id="rId2"/><sheet name="メモ" sheetId="1" r:id="rId1"/></sheets></workbook>')
    zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>')
    zip.file('xl/sharedStrings.xml', '<sst><si><t>項目</t></si><si><r><t>交通</t></r><r><t>費</t></r></si></sst>')
    zip.file('xl/worksheets/sheet2.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>金額</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><f>1000*2</f><v>2000</v></c></row><row r="3"><c r="A3"/></row></sheetData></worksheet>')
    zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>持ち物</t></is></c></row></sheetData></worksheet>')
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    expect(await extractText(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
      .toBe('# 予算 & 実績\n項目\t金額\n交通費\t2000\n\n# メモ\n持ち物')
  })

  it('Excel はファイル一覧のインデックス対象には入れない', () => {
    expect(isIndexable('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(false)
  })

  it('Excel の閉じタグが欠けた XML でも、処理時間を膨らませずに読み終える', async () => {
    const zip = new JSZip()
    zip.file('xl/worksheets/sheet1.xml', `<worksheet><sheetData><row r="1">${'<c r="A1"><v>1'.repeat(200_000)}</row></sheetData></worksheet>`)
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

    const started = Date.now()
    await extractText(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('Excel の展開後のサイズが上限を超えるファイルは、展開せずにエラーにする', async () => {
    const zip = new JSZip()
    zip.file('xl/sharedStrings.xml', 'a'.repeat(31 * 1024 * 1024))
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    expect(buffer.length).toBeLessThan(1024 * 1024)

    await expect(extractText(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
      .rejects.toThrow('too large')
  })

  it('Excel で長い共有文字列を1行の多数のセルから参照させても、取り出す本文は上限で止める', async () => {
    const zip = new JSZip()
    zip.file('xl/sharedStrings.xml', `<sst><si><t>${'あ'.repeat(40_000)}</t></si></sst>`)
    zip.file('xl/worksheets/sheet1.xml', `<worksheet><sheetData><row r="1">${'<c t="s"><v>0</v></c>'.repeat(5_000)}</row></sheetData></worksheet>`)
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

    const text = await extractText(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    // 1セルは Excel の上限の 32,767 文字で切り、行は全体の上限（200,000 文字）を超えたところで打ち切る
    expect(text.length).toBeLessThan(200_000 + 32_767 + 100)
  })

  it('Excel で空のセルが省かれた行も、列の位置を保って取り出す', async () => {
    const zip = new JSZip()
    zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>項目</t></is></c><c r="B1" t="inlineStr"><is><t>予算</t></is></c><c r="C1" t="inlineStr"><is><t>実績</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>交通費</t></is></c><c r="C2"><v>2000</v></c></row></sheetData></worksheet>')
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    expect(await extractText(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
      .toBe('# Sheet1\n項目\t予算\t実績\n交通費\t\t2000')
  })

  it('Excel で遠い列のセルを並べた行は、上限より右の列を読まずに空欄も増やさない', async () => {
    const zip = new JSZip()
    const farCells = Array.from({ length: 300 }, (_, index) => `<c r="${['A', 'Z', 'AZ', 'ZZ', 'AAA', 'XFD'][index % 6]}1"><v>1</v></c>`).join('')
    zip.file('xl/worksheets/sheet1.xml', `<worksheet><sheetData>${`<row r="1">${farCells}</row>`.repeat(2_000)}</sheetData></worksheet>`)
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

    const started = Date.now()
    const text = await extractText(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(Date.now() - started).toBeLessThan(2000)
    expect(Math.max(...text.split('\n').map(line => line.split('\t').length))).toBeLessThanOrEqual(1000)
  })

  it('Excel のシートが上限を超えたときは、読まなかったシートがあることを本文の先頭で伝える', async () => {
    const zip = new JSZip()
    const count = 52
    zip.file('xl/workbook.xml', `<workbook><sheets>${Array.from({ length: count }, (_, i) => `<sheet name="W${i + 1}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`)
    zip.file('xl/_rels/workbook.xml.rels', `<Relationships>${Array.from({ length: count }, (_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`)
    for (let i = 1; i <= count; i += 1) zip.file(`xl/worksheets/sheet${i}.xml`, `<worksheet><sheetData><row r="1"><c r="A1"><v>${i}</v></c></row></sheetData></worksheet>`)
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    const text = await extractText(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(text.startsWith('[注記] シートが52枚あるため、先頭の50枚だけを読みました（残りの2枚は読んでいません）。')).toBe(true)
    expect(text).toContain('# W50')
    expect(text).not.toContain('# W51')
  })

  it('Excel の文字列のふりがなは本文に入れない', async () => {
    const zip = new JSZip()
    zip.file('xl/sharedStrings.xml', '<sst><si><t>交通費</t><rPh sb="0" eb="3"><t>コウツウヒ</t></rPh><phoneticPr fontId="1"/></si><si><r><t>宿泊</t></r><r><t>費</t></r><rPh sb="0" eb="2"><t>シュクハク</t></rPh></si></sst>')
    zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row></sheetData></worksheet>')
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    expect(await extractText(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('# Sheet1\n交通費\t宿泊費')
  })
})

