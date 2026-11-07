const assert = require('node:assert/strict')
const { describe, test } = require('node:test')
const { isAutoUpdateEnabled } = require('./auto-update')

describe('isAutoUpdateEnabled', () => {
  test('本番ビルドのインストール版だけで自動更新を有効にする', () => {
    assert.equal(isAutoUpdateEnabled({ isPackaged: true, deploymentEnv: 'production' }), true)
  })

  test('dev ビルドや開発中の起動では自動更新を動かさない', () => {
    assert.equal(isAutoUpdateEnabled({ isPackaged: true, deploymentEnv: 'development' }), false)
    assert.equal(isAutoUpdateEnabled({ isPackaged: false, deploymentEnv: 'production' }), false)
  })
})
