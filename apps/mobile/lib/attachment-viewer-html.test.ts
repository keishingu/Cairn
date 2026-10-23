import { describe, expect, it } from 'vitest'
import {
  buildImageViewerHtml,
  buildMarkdownDocumentHtml,
  headingSlug,
  markdownDocumentBodyHtml,
  parseImageViewerMessage,
} from './attachment-viewer-html'

const options = { imageLabel: '画像' }

describe('添付 Markdown の HTML', () => {
  it('GFM の表・タスクリスト・取り消し線を描画する', () => {
    const html = markdownDocumentBodyHtml('| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] 済\n- [ ] 未\n\n~~消~~', options)
    expect(html).toContain('<table>')
    expect(html).toContain('<td>1</td>')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('<del>消</del>')
  })

  it('改行1つでも改行として見せる', () => {
    expect(markdownDocumentBodyHtml('一行目\n二行目', options)).toContain('一行目<br>')
  })

  it('生の HTML は描画せず文字として出す', () => {
    const html = markdownDocumentBodyHtml('<script>alert(1)</script>\n\n文中の <b>太字</b>', options)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>')
    expect(html).toContain('&#x3C;script>alert(1)&#x3C;/script>')
    expect(html).toContain('&#x3C;b>太字')
  })

  it('画像は自動取得せず、代替テキストのリンクにする', () => {
    const html = markdownDocumentBodyHtml('![図](https://example.com/a.png) ![](https://example.com/b.png)', options)
    expect(html).not.toContain('<img')
    expect(html).toContain('<a href="https://example.com/a.png">図</a>')
    expect(html).toContain('<a href="https://example.com/b.png">画像</a>')
  })

  it('リンクの中の画像は入れ子のリンクにせず文字だけ残す', () => {
    const html = markdownDocumentBodyHtml('[![図](https://example.com/a.png)](https://example.com)', options)
    expect(html).toBe('<p><a href="https://example.com">図</a></p>')
  })

  it('目次のリンク先になるよう、見出しに GitHub と同じ規則の id を付ける', () => {
    const html = markdownDocumentBodyHtml('[概要へ](#概要)\n\n# 概要\n\n## Step 1: **Setup**!\n\n## 概要', options)
    expect(html).toContain('<h1 id="概要">概要</h1>')
    expect(html).toContain('<h2 id="step-1-setup">')
    expect(html).toContain('<h2 id="概要-1">概要</h2>')
  })

  it('連番の id が既存の見出しと重ならない', () => {
    const used = new Map<string, number>()
    expect(['a', 'a-1', 'a'].map((text) => headingSlug(text, used))).toEqual(['a', 'a-1', 'a-2'])
  })

  it('全体の HTML にテーマの色と拡大できる viewport を入れる', () => {
    const html = buildMarkdownDocumentHtml(
      '# 見出し',
      {
        dark: true,
        background: '#111111',
        surface: '#222222',
        text: '#ffffff',
        text2: '#eeeeee',
        text3: '#999999',
        border: '#333333',
        link: '#88aaff',
      },
      options,
    )
    expect(html).toContain('maximum-scale=5')
    expect(html).toContain('color-scheme: dark')
    expect(html).toContain('background: #111111')
    expect(html).toContain('<h1 id="見出し">見出し</h1>')
  })
})

describe('Android の画像ビューアの HTML', () => {
  it('画像の URI を属性から抜け出せないようエスケープする', () => {
    const html = buildImageViewerHtml('file:///cache/a"><script>.png', '#000000')
    expect(html).toContain('src="file:///cache/a&quot;>&lt;script>.png"')
    expect(html).not.toContain('<script>')
  })

  it('img の読み込み結果だけをメッセージとして受け取る', () => {
    expect(parseImageViewerMessage('loaded')).toBe('loaded')
    expect(parseImageViewerMessage('error')).toBe('error')
    expect(parseImageViewerMessage('{"type":"loaded"}')).toBeNull()
  })
})
