import { describe, expect, it } from 'vitest'
import { shouldRenderMobileNav } from './mobile-shell'

describe('shouldRenderMobileNav', () => {
  it('WebView では MobileNav を隠す', () => {
    expect(shouldRenderMobileNav(true)).toBe(false)
  })

  it('通常のモバイルブラウザでは MobileNav を表示する', () => {
    expect(shouldRenderMobileNav(false)).toBe(true)
  })
})
