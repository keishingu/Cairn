const assert = require('node:assert/strict')
const { describe, test } = require('node:test')
const { getNavigationAction, isAuthSender, registerExternalNavigation } = require('./external-navigation')

const APP_URL = 'https://develop.oss-cairn.com'

describe('getNavigationAction', () => {
  test('同一オリジンのリンクは Electron 内で開く', () => {
    assert.equal(getNavigationAction(`${APP_URL}/projects`, APP_URL), 'allow')
  })

  test('http・https の外部リンクは既定ブラウザで開く対象にする', () => {
    assert.equal(getNavigationAction('https://example.com/docs', APP_URL), 'external')
    assert.equal(getNavigationAction('http://localhost:3000/docs', APP_URL), 'external')
  })

  test('不正な URL と Web 以外のプロトコルは開かない', () => {
    assert.equal(getNavigationAction('not a url', APP_URL), 'deny')
    assert.equal(getNavigationAction('javascript:alert(1)', APP_URL), 'deny')
  })
})

describe('registerExternalNavigation', () => {
  test('認証開始は Cairn のメインフレームからのみ受け付ける', () => {
    const frame = { url: `${APP_URL}/auth/login` }
    const webContents = { mainFrame: frame }
    assert.equal(isAuthSender({ sender: webContents, senderFrame: frame }, webContents, APP_URL), true)
    assert.equal(isAuthSender({ sender: {}, senderFrame: frame }, webContents, APP_URL), false)
    assert.equal(isAuthSender({ sender: webContents, senderFrame: { url: frame.url } }, webContents, APP_URL), false)
    frame.url = 'https://example.com/'
    assert.equal(isAuthSender({ sender: webContents, senderFrame: frame }, webContents, APP_URL), false)
  })
  test('外部リンクを既定ブラウザへ渡し、Electron の新規ウィンドウは開かない', () => {
    let handler
    const openedUrls = []
    const webContents = {
      on: () => {},
      setWindowOpenHandler: value => {
        handler = value
      },
    }
    const openExternal = async url => {
      openedUrls.push(url)
    }

    registerExternalNavigation(webContents, APP_URL, openExternal)

    assert.deepEqual(handler({ url: 'https://example.com/docs' }), { action: 'deny' })
    assert.deepEqual(openedUrls, ['https://example.com/docs'])
  })

  test('認証ページの読み込み失敗を呼び出し元に返し、許可を解除する', async () => {
    const handlers = {}
    const failure = new Error('network failure')
    const navigation = registerExternalNavigation({ loadURL: async () => { throw failure }, setWindowOpenHandler: () => {}, on: (name, handler) => { handlers[name] = handler } }, APP_URL, async () => {})
    await assert.rejects(navigation.startAuth('https://accounts.google.com/o/oauth2/auth', 'https://auth.example.com', 'google'), failure)
    let prevented = false
    handlers['will-redirect']({ isMainFrame: true, url: 'https://accounts.google.com/', preventDefault: () => { prevented = true } })
    assert.equal(prevented, true)
  })

  test('Google カレンダー認証は同一アプリのコールバックだけを許可する', async () => {
    const handlers = {}
    const navigation = registerExternalNavigation({ loadURL: async () => {}, setWindowOpenHandler: () => {}, on: (name, handler) => { handlers[name] = handler } }, APP_URL, async () => {})
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.searchParams.set('redirect_uri', `${APP_URL}/api/calendar/google/callback`)
    await navigation.startCalendarAuth(url.href)
    let prevented = false
    handlers['will-redirect']({ isMainFrame: true, url: 'https://accounts.google.com/consent', preventDefault: () => { prevented = true } })
    assert.equal(prevented, false)
    handlers['will-redirect']({ isMainFrame: true, url: `${APP_URL}/api/calendar/google/callback?code=example`, preventDefault: () => { prevented = true } })
    assert.equal(prevented, false)
    handlers['will-navigate']({ isMainFrame: true, url: 'https://accounts.google.com/', preventDefault: () => { prevented = true } })
    assert.equal(prevented, true)
    url.searchParams.set('redirect_uri', 'https://example.com/api/calendar/google/callback')
    await assert.rejects(navigation.startCalendarAuth(url.href))
    url.searchParams.set('redirect_uri', `${APP_URL}/api/calendar/google/callback`)
    url.hostname = 'example.com'
    await assert.rejects(navigation.startCalendarAuth(url.href))
  })

  test('同一ウィンドウの遷移とリダイレクトも送信先を検証する', () => {
    const handlers = {}
    const openedUrls = []
    const webContents = {
      setWindowOpenHandler: () => {},
      on: (name, handler) => { handlers[name] = handler },
    }
    registerExternalNavigation(webContents, APP_URL, async url => { openedUrls.push(url) })

    for (const name of ['will-navigate', 'will-redirect']) {
      let prevented = false
      const event = { isMainFrame: true, url: `${APP_URL}/projects`, preventDefault: () => { prevented = true } }
      handlers[name](event)
      assert.equal(prevented, false)
      event.url = 'https://example.com/docs'
      handlers[name](event)
      assert.equal(prevented, true)
      prevented = false
      event.url = 'file:///etc/passwd'
      handlers[name](event)
      assert.equal(prevented, true)
    }
    assert.deepEqual(openedUrls, ['https://example.com/docs', 'https://example.com/docs'])
  })

  test('明示的な認証開始後だけプロバイダと同じ Supabase のコールバックを許可する', async () => {
    const handlers = {}
    const opened = []
    const loaded = []
    const navigation = registerExternalNavigation({ loadURL: async url => { loaded.push(url) }, setWindowOpenHandler: () => {}, on: (name, handler) => { handlers[name] = handler } }, APP_URL, async url => { opened.push(url) })
    const navigate = (name, url) => {
      let prevented = false
      handlers[name]({ isMainFrame: true, url, preventDefault: () => { prevented = true } })
      return prevented
    }
    const authorize = new URL('https://project.supabase.co/auth/v1/authorize')
    authorize.searchParams.set('provider', 'google')
    authorize.searchParams.set('redirect_to', `${APP_URL}/api/auth/callback`)
    assert.equal(navigate('will-navigate', authorize.href), true)
    await navigation.startAuth(authorize.href, 'https://project.supabase.co', 'google')
    assert.equal(navigate('will-redirect', 'https://accounts.google.com/o/oauth2/auth'), false)
    assert.equal(navigate('will-redirect', 'https://project.supabase.co/auth/v1/callback?code=example'), false)
    assert.equal(navigate('will-redirect', `${APP_URL}/api/auth/callback?code=example`), false)
    assert.equal(navigate('will-navigate', 'https://accounts.google.com/'), true)
    // linkIdentity は Supabase から直接 provider の URL を受け取る。
    await navigation.startAuth('https://appleid.apple.com/auth/authorize', 'https://project.supabase.co', 'apple')
    assert.equal(navigate('will-redirect', 'https://other.supabase.co/auth/v1/callback'), true)
    assert.equal(navigate('will-redirect', 'https://appleid.apple.com/auth/authorize'), true)
    await navigation.startAuth('https://appleid.apple.com/auth/authorize', 'https://project.supabase.co', 'apple')
    assert.equal(navigate('will-redirect', 'https://appleid.apple.com:444/auth/authorize'), true)
    await navigation.startAuth('https://appleid.apple.com/auth/authorize', 'https://project.supabase.co', 'apple')
    assert.equal(navigate('will-redirect', 'https://user@appleid.apple.com/auth/authorize'), true)
    await assert.rejects(() => navigation.startAuth('https://example.com/', 'https://project.supabase.co', 'google'))
    await assert.rejects(() => navigation.startAuth(authorize.href, 'https://other.supabase.co', 'google'))
    await assert.rejects(() => navigation.startAuth('https://user@accounts.google.com/', 'https://project.supabase.co', 'google'))
    assert.equal(loaded.length, 4)
    await navigation.startAuth('https://accounts.google.com/o/oauth2/auth', 'https://auth.example.com', 'google')
    assert.equal(navigate('will-redirect', 'https://auth.example.com/auth/v1/callback?code=example'), false)
    assert.equal(navigate('will-redirect', 'https://project.supabase.co/auth/v1/callback'), true)
    await assert.rejects(() => navigation.startAuth('https://accounts.google.com/', 'https://auth.example.com:444', 'google'))
    await assert.rejects(() => navigation.startAuth('https://accounts.google.com/', 'https://user@auth.example.com', 'google'))
  })

})
