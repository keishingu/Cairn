import { describe, expect, test } from 'vitest'
import { buildMermaidHtml, MERMAID_VERSION, parseMermaidMessage } from './mermaid-html'

const theme = {
  dark: true,
  background: '#000000',
  surface: '#111111',
  accent: '#10B981',
  accentSoft: '#12352B',
  text: '#FFFFFF',
  text2: '#DDDDDD',
  text3: '#999999',
  border: '#333333',
}

describe('buildMermaidHtml', () => {
  test('バージョンを固定した mermaid を改ざん検知付きで読み込み、Web と同じ strict で描画する', () => {
    const html = buildMermaidHtml('graph TD\n  A-->B', theme)
    expect(html).toContain(`mermaid@${MERMAID_VERSION}/dist/mermaid.min.js`)
    expect(html).toMatch(/integrity="sha384-[A-Za-z0-9+/=]+"/)
    expect(html).toContain('"securityLevel":"strict"')
  })

  test('図の定義に </script> などがあっても HTML を抜け出さない', () => {
    const html = buildMermaidHtml('graph TD\n  A["</script><script>alert(1)</script>"]', theme)
    expect(html).not.toContain('</script><script>alert(1)')
    expect(html).toContain('\\u003c/script\\u003e')
  })
})

describe('parseMermaidMessage', () => {
  test('描画完了とエラーを読み取り、想定外の内容は null にする', () => {
    expect(parseMermaidMessage('{"type":"rendered"}')).toEqual({ type: 'rendered' })
    expect(parseMermaidMessage('{"type":"error","message":"Parse error"}')).toEqual({
      type: 'error',
      message: 'Parse error',
    })
    expect(parseMermaidMessage('not json')).toBeNull()
    expect(parseMermaidMessage('{"type":"other"}')).toBeNull()
  })
})
