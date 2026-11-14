import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function fetchPage() {
  const { GET } = await import('./route')
  const response = await GET()
  return { response, html: await response.text() }
}

const TIMEREX = 'https://timerex.net/s/dongmin.park_471b/579387d1/'

describe('/teams/migration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('目印を差し替えた静的 HTML を返す', async () => {
    const { response, html } = await fetchPage()

    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400')
    expect(html).not.toContain("location.replace('/chats')")
    expect(html).not.toContain('<!-- @teams-')
    expect(html).toContain('data-page="teams-migration"')
    expect(html).toContain('<script src="/cairn-lp.js"></script>')
  })

  it('広告の検索語に合う title・description と canonical・OGP を持つ', async () => {
    const { html } = await fetchPage()
    const head = html.slice(0, html.indexOf('</head>'))

    expect(head).toContain('<title>Teams コミュニティ終了に伴う移行の相談 | Cairn</title>')
    expect(head).toContain('<link rel="canonical" href="https://oss-cairn.com/teams/migration">')
    expect(head).toContain('<meta property="og:url" content="https://oss-cairn.com/teams/migration">')
    expect(head).toContain('property="og:image"')
    const description = head.match(/<meta name="description" content="([^"]+)">/)?.[1] ?? ''
    for (const word of ['Teams', 'コミュニティ', '終了', '代替', '移行']) {
      expect(description).toContain(word)
    }
    expect(description).toContain('Microsoft と提携していません')
  })

  it('Microsoft の公式移行先・提携先と誤認させない注記を置く', async () => {
    const { html } = await fetchPage()

    expect(html).toContain('Cairn は Microsoft の公式移行先・提携サービスではありません。')
    expect(html).toContain('Cairn は Microsoft とは提携しておらず')
    expect(html).not.toMatch(/Microsoft (公認|認定|推奨)の|公式の移行先です|Microsoft partner/)
  })

  it('終了の対象範囲と Microsoft 公式の告知・エクスポート手順へのリンクを載せる', async () => {
    const { html } = await fetchPage()

    expect(html).toContain('職場・学校向けの Teams は対象外')
    expect(html).toContain('href="https://support.microsoft.com/ja-jp/teams/free/communities/communities-deprecation"')
    expect(html).toContain('href="https://support.microsoft.com/en-us/teams/free/communities/communities-deprecation"')
    expect(html).toContain(
      'href="https://support.microsoft.com/ja-jp/teams/free/settings/export-or-delete-your-data-in-microsoft-teams-free"',
    )
  })

  it('相談は TimeRex を第一にし、相談窓口ページ・メール・無料登録の導線も残す', async () => {
    const { html } = await fetchPage()

    const consult = [...html.matchAll(/data-tm-event="consultation"[^>]*href="([^"]+)"/g)].map((m) => m[1])
    expect(consult[0]).toBe(
      `${TIMEREX}?utm_source=oss-cairn&amp;utm_medium=lp&amp;utm_campaign=teams-migration&amp;utm_content=hero`,
    )
    expect(consult).toContain(
      'https://moruit.com/?utm_source=oss-cairn&amp;utm_medium=lp&amp;utm_campaign=teams-migration&amp;utm_content=teams-page#consultation',
    )
    expect(html).toMatch(/data-tm-event="email"[^>]*href="mailto:info@orikata\.co\.jp\?subject=/)
    expect(html).toContain(
      'data-tm-destination="signup"\n          href="/auth/login?utm_source=lp&amp;utm_campaign=teams-migration&amp;utm_content=tm-hero"',
    )
    expect(html).toContain('Teams 移行について無料相談する')
    expect(html).toContain('Cairn を無料で試す')
  })

  it('計測対象のリンクはすべて場所と遷移先を持つ', async () => {
    const { html } = await fetchPage()

    const links = [...html.matchAll(/<a [^>]*data-tm-event="[^"]+"[^>]*>/g)].map((m) => m[0])
    expect(links.length).toBeGreaterThanOrEqual(6)
    for (const link of links) {
      expect(link).toMatch(/data-tm-location="[a-z-]+"/)
      expect(link).toMatch(/data-tm-destination="(timerex|moru|signup|email)"/)
    }
  })

  it('PostHog と Google 広告のタグを公開ページと同じ関数で入れる', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', 'phc_test')
    vi.stubEnv('LP_GOOGLE_ADS_TAG_ID', 'AW-1')
    const { html } = await fetchPage()

    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('window.__CAIRN_LP_POSTHOG__={"token":"phc_test"')
    expect(head).toContain('gtag/js?id=AW-1')
  })
})

describe('/teams/migration の計測（cairn-lp.js）', () => {
  const capture = vi.fn()

  beforeEach(async () => {
    capture.mockReset()
    const { html } = await fetchPage()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    for (const attr of Array.from(doc.documentElement.attributes)) {
      document.documentElement.setAttribute(attr.name, attr.value)
    }
    document.body.innerHTML = doc.body.innerHTML
    window.history.replaceState({}, '', '/teams/migration?utm_source=google&utm_medium=cpc&utm_campaign=teams&gclid=abc123')
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    Object.assign(window, {
      __CAIRN_LP_POSTHOG__: { token: 'phc_test', host: 'https://us.i.posthog.com' },
      posthog: { capture, __loaded: true },
    })
    const script = await readFile(join(process.cwd(), 'public/cairn-lp.js'), 'utf8')
    window.eval(script)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('表示時に teams_migration_lp_view を UTM 付きで送り、gclid は送らず URL も書き換えない', () => {
    expect(capture).toHaveBeenCalledWith('teams_migration_lp_view', {
      source_page: '/teams/migration',
      lp_lang: expect.any(String),
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'teams',
    })
    expect(JSON.stringify(capture.mock.calls)).not.toContain('abc123')
    expect(window.location.search).toContain('gclid=abc123')
  })

  it.each([
    ['consultation', 'hero', 'teams_migration_consultation_click', 'timerex'],
    ['signup', 'hero', 'teams_migration_signup_click', 'signup'],
    ['email', 'consult', 'teams_migration_email_click', 'email'],
    ['consultation', 'consult-alt', 'teams_migration_consultation_click', 'moru'],
  ])('%s（%s）のクリックで %s を送る', (kind, location, event, destination) => {
    const link = document.querySelector<HTMLAnchorElement>(
      `a[data-tm-event="${kind}"][data-tm-location="${location}"]`,
    )!
    link.addEventListener('click', (e) => e.preventDefault())
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(capture).toHaveBeenCalledWith(
      event,
      expect.objectContaining({ source_page: '/teams/migration', cta_location: location, destination, utm_source: 'google' }),
      { transport: 'sendBeacon' },
    )
    expect(capture).not.toHaveBeenCalledWith('lp_cta_clicked', expect.anything(), expect.anything())
  })
})

describe('/teams/migration の PostHog SDK 設定（cairn-lp.js）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete (window as unknown as { posthog?: unknown }).posthog
  })

  it('SDK が自動で付ける URL・流入元のプロパティから gclid などの広告クリック ID を取り除く', async () => {
    const { html } = await fetchPage()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    for (const attr of Array.from(doc.documentElement.attributes)) {
      document.documentElement.setAttribute(attr.name, attr.value)
    }
    document.body.innerHTML = doc.body.innerHTML
    window.history.replaceState({}, '', '/teams/migration?utm_source=google&gclid=abc123')
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    delete (window as unknown as { posthog?: unknown }).posthog
    Object.assign(window, { __CAIRN_LP_POSTHOG__: { token: 'phc_test', host: 'https://us.i.posthog.com' } })
    window.eval(await readFile(join(process.cwd(), 'public/cairn-lp.js'), 'utf8'))

    const stub = (window as unknown as { posthog: { _i: [string, { before_send?: (e: unknown) => unknown }][] } }).posthog
    const beforeSend = stub._i[0]![1].before_send!
    expect(typeof beforeSend).toBe('function')

    const url = 'https://oss-cairn.com/teams/migration?utm_source=google&gclid=abc123&gad_source=1'
    const event = beforeSend({
      event: '$pageview',
      properties: { $current_url: url, gclid: 'abc123', gad_source: '1', utm_source: 'google', $pathname: '/teams/migration' },
      $set_once: { $initial_current_url: url, $initial_gclid: 'abc123', $initial_utm_source: 'google' },
    }) as { properties: Record<string, string>; $set_once: Record<string, string> }

    expect(event.properties['$current_url']).toBe('https://oss-cairn.com/teams/migration?utm_source=google')
    expect(event.properties['utm_source']).toBe('google')
    expect(event.properties).not.toHaveProperty('gclid')
    expect(event.properties).not.toHaveProperty('gad_source')
    expect(event.$set_once['$initial_current_url']).toBe('https://oss-cairn.com/teams/migration?utm_source=google')
    expect(event.$set_once).not.toHaveProperty('$initial_gclid')
    expect(event.$set_once['$initial_utm_source']).toBe('google')
    expect(JSON.stringify(event)).not.toContain('abc123')
    // ブラウザの URL は書き換えないので、Google 広告タグは gclid を読める
    expect(window.location.search).toContain('gclid=abc123')
  })
})
