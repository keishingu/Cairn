import { describe, expect, it } from 'vitest'
import { injectPublicPageHeadScripts } from './head-scripts'

const HTML = '<html><head><title>x</title></head><body></body></html>'
const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv

describe('injectPublicPageHeadScripts', () => {
  it('計測の環境変数が無ければ HTML をそのまま返す', () => {
    expect(injectPublicPageHeadScripts(HTML, env({}))).toBe(HTML)
  })

  it('Google 広告の ID があれば gtag.js と config を head の末尾に入れる', () => {
    const html = injectPublicPageHeadScripts(HTML, env({ LP_GOOGLE_ADS_TAG_ID: 'AW-787755212' }))
    const head = html.slice(0, html.indexOf('</head>'))

    expect(head).toContain('<script async src="https://www.googletagmanager.com/gtag/js?id=AW-787755212"></script>')
    expect(head).toContain("gtag('js',new Date());gtag('config','AW-787755212');")
    expect(html).not.toContain('gtm.js')
  })

  it('Google 広告の ID が AW- と数字でなければ例外にする', () => {
    expect(() =>
      injectPublicPageHeadScripts(HTML, env({ LP_GOOGLE_ADS_TAG_ID: "AW-1');alert(1);//" })),
    ).toThrow('LP_GOOGLE_ADS_TAG_ID の形式が不正です')
  })

  it('PostHog と Google 広告の両方があれば両方入れる', () => {
    const html = injectPublicPageHeadScripts(
      HTML,
      env({ NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: 'phc_x', LP_GOOGLE_ADS_TAG_ID: 'AW-1' }),
    )

    expect(html).toContain('window.__CAIRN_LP_POSTHOG__={"token":"phc_x","host":"https://us.i.posthog.com"};')
    expect(html).toContain('gtag/js?id=AW-1')
  })

  it('head が無い HTML では計測を入れられないため例外にする', () => {
    expect(() =>
      injectPublicPageHeadScripts('<p>x</p>', env({ LP_GOOGLE_ADS_TAG_ID: 'AW-1' })),
    ).toThrow('</head>')
  })
})
