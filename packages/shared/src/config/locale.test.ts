import { describe, expect, it } from 'vitest'
import {
  localeFromAcceptLanguage,
  parseLocalePreference,
  readLocalePreferenceCookie,
  resolveLocale,
} from './locale'

describe('localeFromAcceptLanguage', () => {
  it('英語を最優先の対応言語として選ぶ', () => {
    expect(localeFromAcceptLanguage('en-US,en;q=0.9,ja;q=0.8')).toBe('en')
    expect(localeFromAcceptLanguage('fr-FR,en;q=0.8')).toBe('en')
  })

  it('日本語を選び、未対応だけなら日本語に戻す', () => {
    expect(localeFromAcceptLanguage('ja-JP,en;q=0.5')).toBe('ja')
    expect(localeFromAcceptLanguage('fr-FR,de;q=0.8')).toBe('ja')
    expect(localeFromAcceptLanguage(null)).toBe('ja')
  })

  it('quality が低い言語より高い言語を優先する', () => {
    expect(localeFromAcceptLanguage('en;q=0.2,ja;q=0.9')).toBe('ja')
  })
})

describe('resolveLocale', () => {
  it('明示の選択はブラウザ言語より優先する', () => {
    expect(resolveLocale('en', 'ja-JP')).toBe('en')
    expect(resolveLocale('ja', 'en-US')).toBe('ja')
  })

  it('system はブラウザ言語に従う', () => {
    expect(resolveLocale('system', 'en-GB')).toBe('en')
    expect(resolveLocale('system', 'ja')).toBe('ja')
  })
})

describe('parseLocalePreference', () => {
  it('未知の値は system にする', () => {
    expect(parseLocalePreference('fr')).toBe('system')
    expect(parseLocalePreference(undefined)).toBe('system')
    expect(parseLocalePreference('en')).toBe('en')
  })
})

describe('readLocalePreferenceCookie', () => {
  it('言語設定クッキーだけを読む', () => {
    expect(readLocalePreferenceCookie('cairn-theme=dark; cairn-locale-preference=en')).toBe('en')
    expect(readLocalePreferenceCookie('cairn-locale-preference=ja')).toBe('ja')
    expect(readLocalePreferenceCookie(null)).toBe('system')
  })
})
