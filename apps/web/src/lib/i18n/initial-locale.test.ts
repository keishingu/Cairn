import { describe, expect, it } from 'vitest'
import { explicitLocaleFromCookie } from './initial-locale'

describe('explicitLocaleFromCookie', () => {
  it('明示の言語だけをアカウント初期値にする', () => {
    expect(explicitLocaleFromCookie('cairn-locale-preference=en')).toBe('en')
    expect(explicitLocaleFromCookie('cairn-locale-preference=ja')).toBe('ja')
    expect(explicitLocaleFromCookie('cairn-locale-preference=ko')).toBe('ko')
    expect(explicitLocaleFromCookie('cairn-locale-preference=system')).toBeUndefined()

    expect(explicitLocaleFromCookie(null)).toBeUndefined()
  })
})
