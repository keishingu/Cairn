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
})
