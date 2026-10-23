const assert = require('node:assert/strict')
const { describe, test } = require('node:test')
const { isPermissionAllowed, registerPermissionPolicy } = require('./permission-policy')

const APP_URL = 'https://develop.oss-cairn.com'

describe('isPermissionAllowed', () => {
  test('Cairnからのクリップボード書き込みと通知だけを許可する', () => {
    assert.equal(isPermissionAllowed('clipboard-sanitized-write', `${APP_URL}/chats/1`, APP_URL), true)
    assert.equal(isPermissionAllowed('notifications', APP_URL, APP_URL), true)
    assert.equal(isPermissionAllowed('push', APP_URL, APP_URL), true)
  })

  test('未使用の権限と外部オリジンからの要求を拒否する', () => {
    assert.equal(isPermissionAllowed('media', APP_URL, APP_URL), false)
    assert.equal(isPermissionAllowed('clipboard-read', APP_URL, APP_URL), false)
    assert.equal(isPermissionAllowed('clipboard-sanitized-write', 'https://example.com', APP_URL), false)
    assert.equal(isPermissionAllowed('clipboard-sanitized-write', 'not a url', APP_URL), false)
  })
})

describe('registerPermissionPolicy', () => {
  test('checkとrequestの両方に同じポリシーを設定する', () => {
    let checkHandler
    let requestHandler
    const electronSession = {
      setPermissionCheckHandler: handler => { checkHandler = handler },
      setPermissionRequestHandler: handler => { requestHandler = handler },
    }

    registerPermissionPolicy(electronSession, APP_URL)

    const webContents = { getURL: () => `${APP_URL}/chats/1` }
    assert.equal(checkHandler(webContents, 'clipboard-sanitized-write', APP_URL, { isMainFrame: true }), true)

    let allowed
    requestHandler(webContents, 'clipboard-sanitized-write', value => { allowed = value }, { requestingUrl: `${APP_URL}/chats/1` })
    assert.equal(allowed, true)
  })
})
