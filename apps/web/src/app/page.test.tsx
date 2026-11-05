import { afterEach, describe, expect, it, vi } from 'vitest'

async function fetchLp() {
  const { GET } = await import('./route')
  const response = await GET()
  return { response, html: await response.text() }
}

describe('RootRoute', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('LP の静的 HTML を返す', async () => {
    const { response, html } = await fetchLp()

    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(html).toContain('<title>Cairn')
    expect(html).toContain('property="og:image"')
  })

  it('App Store と Google Play の両方の公式ストアへのリンクを載せる', async () => {
    const { html } = await fetchLp()

    expect(html).toContain('href="https://apps.apple.com/jp/app/cairn/id6800673777"')
    expect(html).toContain('href="https://play.google.com/store/apps/details?id=com.oss_cairn"')
    for (const cta of ['hero', 'details', 'final', 'footer']) {
      expect(html).toContain(`data-cta="appstore-${cta}"`)
      expect(html).toContain(`data-cta="googleplay-${cta}"`)
    }
  })

  it('ストアの公式バッジを日英それぞれの言語で表示する', async () => {
    const { html } = await fetchLp()

    for (const src of ['app-store-ja.svg', 'app-store-en.svg', 'google-play-ja.png', 'google-play-en.png']) {
      expect(html).toContain(`src="/badges/${src}"`)
    }
  })

  it('Teams 移行の告知はヒーローより前にあり、会話履歴とメディアを引き継げると伝える', async () => {
    const { html } = await fetchLp()

    const campaign = html.indexOf('id="teams-migration"')
    expect(campaign).toBeGreaterThan(-1)
    expect(campaign).toBeLessThan(html.indexOf('id="stay"'))
    expect(html).toContain('data-cta="teams-migration-banner"')
    expect(html).toContain('data-cta="teams-migration-banner" href="https://timerex.net/s/dongmin.park_471b/579387d1/"')
    expect(html).toContain('data-cta="teams-migration-mail" href="mailto:info@orikata.co.jp?subject=')
    expect(html).toContain('ご予約・メールの際は「Teams 移行」とお書きください。')
    expect(html).toContain('data-cta="teams-migration-detail" href="/teams/migration"')
    expect(html).toContain('会話履歴・メディアを引き継いで移行できます')
    expect(html).not.toMatch(/完全に移行|すべて移行/)
  })

  it('チャットからのタスク作成は「タスク化する」で説明し、廃止したチェックボックス記法と回数表記を残さない', async () => {
    const { html } = await fetchLp()

    expect(html).toContain('タスク化する')
    expect(html).not.toMatch(/☑ がタスクになる|完了のチェックはチャットとタスク一覧で同期|最大 月 30 回/)
  })

  it('AI PMO と外部リポジトリの固有名を LP に書かない', async () => {
    const { html } = await fetchLp()

    expect(html).not.toMatch(/AI PMO|ナッジ|Rack/)
  })

  it('PostHog のトークンが無ければ計測設定を埋め込まない', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', '')
    const { html } = await fetchLp()

    expect(html).not.toContain('__CAIRN_LP_POSTHOG__=')
  })

  it('PostHog のトークンがあれば head に計測設定を埋め込む', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', 'phc_test</script>')
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://eu.i.posthog.com')
    const { html } = await fetchLp()

    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain(
      'window.__CAIRN_LP_POSTHOG__={"token":"phc_test\\u003c/script>","host":"https://eu.i.posthog.com"};',
    )
  })
})
