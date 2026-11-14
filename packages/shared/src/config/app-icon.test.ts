import { describe, expect, test } from 'vitest'
import { DEFAULT_APP_ICON_VARIANTS, resolveAppIconVariant } from './app-icon'

const development = DEFAULT_APP_ICON_VARIANTS.development

describe('resolveAppIconVariant', () => {
  test('外観設定が初期値なら環境別の既定アイコンを使う', () => {
    expect(
      resolveAppIconVariant({ theme: 'system', accentId: 'emerald', systemTheme: 'dark', defaultVariant: development }),
    ).toEqual({ accentId: 'blue', theme: 'light' })
  })

  test('テーマが「システム」でアクセントを変えたら OS の外観に合わせる', () => {
    expect(
      resolveAppIconVariant({ theme: 'system', accentId: 'rose', systemTheme: 'dark', defaultVariant: development }),
    ).toEqual({ accentId: 'rose', theme: 'dark' })
  })

  test('テーマを明示したらアクセントが初期値でも設定に合わせる', () => {
    expect(
      resolveAppIconVariant({ theme: 'dark', accentId: 'emerald', systemTheme: 'light', defaultVariant: development }),
    ).toEqual({ accentId: 'emerald', theme: 'dark' })
  })
})
