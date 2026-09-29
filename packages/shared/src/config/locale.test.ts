import { describe, expect, it } from 'vitest'
import {
  acceptLanguageFromTags,
  localeFromAcceptLanguage,
  formatAppDate,
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

  it('韓国語を対応言語として選ぶ', () => {
    expect(localeFromAcceptLanguage('ko-KR,en;q=0.8')).toBe('ko')
    expect(localeFromAcceptLanguage('ko,ja;q=0.5')).toBe('ko')
  })

  it('quality が低い言語より高い言語を優先する', () => {
    expect(localeFromAcceptLanguage('en;q=0.2,ja;q=0.9')).toBe('ja')
  })
})

describe('acceptLanguageFromTags', () => {
  it('先頭以外の対応言語も Accept-Language と同じ順で残す', () => {
    expect(localeFromAcceptLanguage(acceptLanguageFromTags(['fr-FR', 'en-US']))).toBe('en')
    expect(localeFromAcceptLanguage(acceptLanguageFromTags(['ja-JP', 'en-US']))).toBe('ja')
    expect(localeFromAcceptLanguage(acceptLanguageFromTags(['ko-KR', 'en-US']))).toBe('ko')
    expect(acceptLanguageFromTags([])).toBeNull()
    expect(acceptLanguageFromTags(null)).toBeNull()
  })
})

describe('formatAppDate', () => {
  it('表示言語の日付形式を使う', () => {
    const value = new Date(2026, 8, 25)
    expect(formatAppDate('ja', value)).toBe(value.toLocaleDateString('ja-JP'))
    expect(formatAppDate('en', value)).toBe(value.toLocaleDateString('en-US'))
    expect(formatAppDate('ko', value)).toBe(value.toLocaleDateString('ko-KR'))
  })
})

describe('resolveLocale', () => {
  it('明示の選択はブラウザ言語より優先する', () => {
    expect(resolveLocale('en', 'ja-JP')).toBe('en')
    expect(resolveLocale('ja', 'en-US')).toBe('ja')
    expect(resolveLocale('ko', 'en-US')).toBe('ko')
  })

  it('system はブラウザ言語に従う', () => {
    expect(resolveLocale('system', 'en-GB')).toBe('en')
    expect(resolveLocale('system', 'ja')).toBe('ja')
    expect(resolveLocale('system', 'ko-KR')).toBe('ko')
  })
})

describe('parseLocalePreference', () => {
  it('未知の値は system にする', () => {
    expect(parseLocalePreference('fr')).toBe('system')
    expect(parseLocalePreference(undefined)).toBe('system')
    expect(parseLocalePreference('en')).toBe('en')
    expect(parseLocalePreference('ko')).toBe('ko')
  })
})

describe('readLocalePreferenceCookie', () => {
  it('言語設定クッキーだけを読む', () => {
    expect(readLocalePreferenceCookie('cairn-theme=dark; cairn-locale-preference=en')).toBe('en')
    expect(readLocalePreferenceCookie('cairn-locale-preference=ja')).toBe('ja')
    expect(readLocalePreferenceCookie('cairn-locale-preference=ko')).toBe('ko')
    expect(readLocalePreferenceCookie(null)).toBe('system')
  })

  it('壊れたパーセントエンコードは system にする', () => {
    expect(readLocalePreferenceCookie('cairn-locale-preference=%')).toBe('system')
    expect(readLocalePreferenceCookie('cairn-locale-preference=%E0%A4%A')).toBe('system')
  })
})
