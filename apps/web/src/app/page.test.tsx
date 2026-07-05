import { describe, expect, it } from 'vitest'

describe('RootRoute', () => {
  it('LP の静的 HTML を返す', async () => {
    const { GET } = await import('./route')

    const response = await GET()
    const html = await response.text()

    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(html).toContain('<title>Cairn')
    expect(html).toContain('property="og:image"')
  })
})
