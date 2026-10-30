const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { describe, test } = require('node:test')
const { resolveAppIconFile } = require('./app-icon')

const fileName = (file) => file && path.basename(file)

describe('resolveAppIconFile', () => {
  test('外観設定が初期値ならビルドごとの既定アイコンにする', () => {
    const appearance = { theme: 'system', accentId: 'emerald', resolvedTheme: 'dark' }
    assert.equal(fileName(resolveAppIconFile(appearance, 'development')), 'blue-light.png')
    assert.equal(fileName(resolveAppIconFile(appearance, 'production')), 'emerald-dark.png')
  })

  test('テーマが「システム」なら OS の外観、明示されていればその外観にする', () => {
    assert.equal(fileName(resolveAppIconFile({ theme: 'system', accentId: 'rose', resolvedTheme: 'light' }, 'production')), 'rose-light.png')
    assert.equal(fileName(resolveAppIconFile({ theme: 'dark', accentId: 'emerald', resolvedTheme: 'light' }, 'development')), 'emerald-dark.png')
  })

  test('解決したアイコンファイルが同梱されている', () => {
    const file = resolveAppIconFile({ theme: 'light', accentId: 'cyan', resolvedTheme: 'light' }, 'production')
    assert.equal(fs.existsSync(file), true)
  })

  test('renderer から届いた不正な値ではアイコンを変えない', () => {
    assert.equal(resolveAppIconFile({ theme: 'system', accentId: '../x', resolvedTheme: 'dark' }, 'production'), null)
    assert.equal(resolveAppIconFile({ theme: 'sepia', accentId: 'blue', resolvedTheme: 'dark' }, 'production'), null)
    assert.equal(resolveAppIconFile(null, 'production'), null)
  })
})
