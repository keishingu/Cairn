const assert = require('node:assert/strict')
const { describe, test } = require('node:test')
const { getNavigationAction, registerExternalNavigation } = require('./external-navigation')

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

  test('OAuth の認可からコールバックまでは同じウィンドウを使い、他の外部遷移は許可しない', () => {
    const handlers = {}
    const opened = []
    registerExternalNavigation({ setWindowOpenHandler: () => {}, on: (name, handler) => { handlers[name] = handler } }, APP_URL, async url => { opened.push(url) })
    const navigate = (name, url) => {
      let prevented = false
      handlers[name]({ isMainFrame: true, url, preventDefault: () => { prevented = true } })
      return prevented
    }
    for (const provider of ['google', 'apple']) {
      const authorize = new URL('https://project.supabase.co/auth/v1/authorize')
      authorize.searchParams.set('provider', provider)
      authorize.searchParams.set('redirect_to', `${APP_URL}/api/auth/callback?next=%2Fchats`)
      assert.equal(navigate('will-navigate', authorize.href), false)
      assert.equal(navigate('will-redirect', provider === 'google' ? 'https://accounts.google.com/o/oauth2/auth' : 'https://appleid.apple.com/auth/authorize'), false)
      assert.equal(navigate('will-redirect', 'https://project.supabase.co/auth/v1/callback?code=example'), false)
      assert.equal(navigate('will-redirect', `${APP_URL}/api/auth/callback?code=example`), false)
      assert.equal(navigate('will-navigate', 'https://accounts.google.com/'), true)
    }
    assert.equal(navigate('will-navigate', 'https://example.com/'), true)
    assert.equal(navigate('will-navigate', `https://project.supabase.co/auth/v1/authorize?provider=google&redirect_to=https://example.com/api/auth/callback`), true)
    assert.equal(opened.length, 4)
  })

})
