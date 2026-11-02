import { describe, expect, it } from 'vitest'
import { DEFAULT_APP_ICON_VARIANTS } from '@cairn/shared'
import { ALTERNATE_APP_ICONS } from '../app.config'
import { toAlternateIconName } from './app-icon'

describe('外観設定に連動するアプリアイコン名', () => {
  it('ビルドの既定アイコンと同じなら別アイコンを解除する', () => {
    expect(toAlternateIconName({ accentId: 'blue', theme: 'light' }, DEFAULT_APP_ICON_VARIANTS.development)).toBeNull()
    expect(toAlternateIconName({ accentId: 'emerald', theme: 'dark' }, DEFAULT_APP_ICON_VARIANTS.production)).toBeNull()
  })

  it('既定と異なるならネイティブに登録した別アイコン名を返す', () => {
    const name = toAlternateIconName({ accentId: 'emerald', theme: 'dark' }, DEFAULT_APP_ICON_VARIANTS.development)
    expect(name).toBe('EmeraldDark')
    expect(ALTERNATE_APP_ICONS.map((icon) => icon.name)).toContain(name)
  })

  it('全アクセント×ライト/ダークの別アイコンをネイティブに登録する', () => {
    expect(ALTERNATE_APP_ICONS).toHaveLength(14)
  })
})
