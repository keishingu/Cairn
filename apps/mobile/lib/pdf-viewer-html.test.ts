import { describe, expect, it } from 'vitest'
import {
  buildPdfViewerHtml,
  findPdfBinaryData,
  parsePdfViewerMessage,
  pdfReadRange,
  pdfViewerReplyScript,
} from './pdf-viewer-html'

const baseOptions = { library: 'export const a = 1', worker: 'self.x = 1', fileSize: 1234, background: '#000000' }

function scriptConfig(html: string): Record<string, unknown> {
  const match = /var config = (.*)\n/.exec(html)
  if (!match?.[1]) throw new Error('config が見つからない')
  return JSON.parse(match[1]) as Record<string, unknown>
}

describe('PDF ビューアの HTML', () => {
  it('外部から何も読み込まないよう CSP で接続先を絞る', () => {
    const html = buildPdfViewerHtml(baseOptions)
    expect(html).toContain("default-src 'none'")
    expect(html).toContain("script-src 'unsafe-inline' blob: 'wasm-unsafe-eval'")
    expect(html).toContain('worker-src data:')
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('WebView で動かすスクリプトが構文として正しい', () => {
    const html = buildPdfViewerHtml(baseOptions)
    const script = /<script>\n([\s\S]*)\n<\/script>/.exec(html)?.[1]
    expect(script).toBeDefined()
    expect(() => new Function(script ?? '')).not.toThrow()
  })

  it('pdf.js 本体・worker・ファイルの大きさをスクリプトへ渡す', () => {
    const config = scriptConfig(buildPdfViewerHtml(baseOptions))
    expect(config['library']).toBe(baseOptions.library)
    expect(config['worker']).toBe(baseOptions.worker)
    expect(config['fileSize']).toBe(1234)
  })

  it('同梱ソースに </script> があっても HTML を抜け出さない', () => {
    const library = 'const s = "</script><script>alert(1)</script>"\u2028'
    const html = buildPdfViewerHtml({ ...baseOptions, library })
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(scriptConfig(html)['library']).toBe(library)
  })

  it('同梱ソースの $ を置換パターンとして解釈しない', () => {
    const library = "x.replace(/a/, '$&$1')"
    expect(scriptConfig(buildPdfViewerHtml({ ...baseOptions, library }))['library']).toBe(library)
  })

  it('ページの領域だけ白にして、背景は指定の色にする', () => {
    const html = buildPdfViewerHtml({ ...baseOptions, background: '#123456' })
    expect(html).toContain('background: #123456')
    expect(html).toContain('background: #FFFFFF')
  })

  it('テキストレイヤーだけ文字を選べるようにする', () => {
    const html = buildPdfViewerHtml(baseOptions)
    expect(html).toMatch(/body \{[^}]*user-select: none/)
    expect(html).toMatch(/\.textLayer span, \.textLayer br \{[^}]*user-select: text/)
  })
})

describe('PDF ビューアからのメッセージ', () => {
  it('描画完了・ページ移動・リンク・エラーを読み取る', () => {
    expect(parsePdfViewerMessage('{"type":"loaded","total":3}')).toEqual({ type: 'loaded', total: 3 })
    expect(parsePdfViewerMessage('{"type":"page","current":2,"total":3}')).toEqual({
      type: 'page',
      current: 2,
      total: 3,
    })
    expect(parsePdfViewerMessage('{"type":"link","url":"https://example.com"}')).toEqual({
      type: 'link',
      url: 'https://example.com',
    })
    expect(parsePdfViewerMessage('{"type":"error","message":"Invalid PDF structure."}')).toEqual({
      type: 'error',
      message: 'Invalid PDF structure.',
    })
  })

  it('範囲と同梱データの問い合わせを読み取る', () => {
    expect(parsePdfViewerMessage('{"type":"range","id":1,"begin":0,"end":65536}')).toEqual({
      type: 'range',
      id: 1,
      begin: 0,
      end: 65536,
    })
    expect(parsePdfViewerMessage('{"type":"binary","id":2,"kind":"cMapUrl","filename":"UniJIS-UCS2-H.bcmap"}')).toEqual(
      { type: 'binary', id: 2, kind: 'cMapUrl', filename: 'UniJIS-UCS2-H.bcmap' },
    )
  })

  it('形の合わないメッセージは null にする', () => {
    expect(parsePdfViewerMessage('not json')).toBeNull()
    expect(parsePdfViewerMessage('null')).toBeNull()
    expect(parsePdfViewerMessage('{"type":"unknown"}')).toBeNull()
    expect(parsePdfViewerMessage('{"type":"loaded","total":0}')).toBeNull()
    expect(parsePdfViewerMessage('{"type":"page","current":4,"total":3}')).toBeNull()
    expect(parsePdfViewerMessage('{"type":"link","url":""}')).toBeNull()
    expect(parsePdfViewerMessage('{"type":"range","id":1,"begin":10,"end":10}')).toBeNull()
    expect(parsePdfViewerMessage('{"type":"range","id":1,"begin":-1,"end":10}')).toBeNull()
    expect(parsePdfViewerMessage('{"type":"range","id":1.5,"begin":0,"end":10}')).toBeNull()
    expect(parsePdfViewerMessage('{"type":"binary","id":1,"kind":"cMapUrl"}')).toBeNull()
  })

  it('エラーの文言がなくてもエラーとして扱う', () => {
    expect(parsePdfViewerMessage('{"type":"error"}')).toEqual({ type: 'error', message: '' })
  })
})

describe('PDF の範囲の読み取り', () => {
  it('ファイルの終わりを超える要求は末尾までに縮める', () => {
    expect(pdfReadRange(0, 65536, 1000)).toEqual({ position: 0, length: 1000 })
    expect(pdfReadRange(500, 900, 1000)).toEqual({ position: 500, length: 400 })
  })

  it('ファイルの外から始まる要求は null にする', () => {
    expect(pdfReadRange(1000, 2000, 1000)).toBeNull()
  })
})

describe('同梱データの検索', () => {
  const assets = { cMaps: { 'H.bcmap': 'aaa' }, wasm: { 'openjpeg.wasm': 'bbb' } }

  it('種類とファイル名で CMap と wasm を返す', () => {
    expect(findPdfBinaryData(assets, 'cMapUrl', 'H.bcmap')).toBe('aaa')
    expect(findPdfBinaryData(assets, 'wasmUrl', 'openjpeg.wasm')).toBe('bbb')
  })

  it('同梱していないもの・種類違い・プロトタイプのキーは null にする', () => {
    expect(findPdfBinaryData(assets, 'cMapUrl', 'V.bcmap')).toBeNull()
    expect(findPdfBinaryData(assets, 'wasmUrl', 'H.bcmap')).toBeNull()
    expect(findPdfBinaryData(assets, 'standardFontDataUrl', 'FoxitSans.pfb')).toBeNull()
    expect(findPdfBinaryData(assets, 'cMapUrl', 'toString')).toBeNull()
  })
})

describe('問い合わせへの返事', () => {
  it('receive を呼ぶスクリプトにし、文字列は HTML やスクリプトを抜け出さない', () => {
    const script = pdfViewerReplyScript({ id: 3, error: '</script>"\u2028' })
    expect(script.startsWith('window.cairnPdf && window.cairnPdf.receive(')).toBe(true)
    expect(script.endsWith(');true;')).toBe(true)
    expect(script).not.toContain('</script>')
    expect(script).not.toContain('\u2028')
    const argument = script.slice('window.cairnPdf && window.cairnPdf.receive('.length, -');true;'.length)
    expect(JSON.parse(argument)).toEqual({ id: 3, error: '</script>"\u2028' })
  })
})
