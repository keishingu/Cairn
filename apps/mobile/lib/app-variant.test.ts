import { describe, expect, it } from 'vitest'
import { resolveAppVariant } from '../app.config'

describe('モバイルアプリの配布環境別設定', () => {
  it('未指定時は本番アプリを上書きしない開発版になる', () => {
    expect(resolveAppVariant(undefined)).toEqual({
      name: 'Cairn Dev',
      scheme: 'cairn-dev',
      iosBundleIdentifier: 'com.oss-cairn.dev',
      androidPackage: 'com.oss_cairn.dev',
    })
  })

  it('Internal Distributionは独立したプレビュー版になる', () => {
    expect(resolveAppVariant('preview')).toEqual({
      name: 'Cairn Preview',
      scheme: 'cairn-preview',
      iosBundleIdentifier: 'com.oss-cairn.preview',
      androidPackage: 'com.oss_cairn.preview',
    })
  })

  it('productionだけが本番識別子を利用する', () => {
    expect(resolveAppVariant('production')).toEqual({
      name: 'Cairn',
      scheme: 'cairn',
      iosBundleIdentifier: 'com.oss-cairn',
      androidPackage: 'com.oss_cairn',
    })
  })
})
