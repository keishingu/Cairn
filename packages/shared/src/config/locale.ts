// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export const APP_LOCALES = ['ja', 'en'] as const
export type AppLocale = (typeof APP_LOCALES)[number]

// system はブラウザ（Accept-Language / navigator.languages）に従う。
// 明示の ja / en は設定画面と LP の言語スイッチが保存する選択。
export const LOCALE_PREFERENCES = ['ja', 'en', 'system'] as const
export type LocalePreference = (typeof LOCALE_PREFERENCES)[number]

export const DEFAULT_LOCALE_PREFERENCE: LocalePreference = 'system'
export const LOCALE_PREFERENCE_COOKIE = 'cairn-locale-preference'

export function isAppLocale(value: unknown): value is AppLocale {
  return value === 'ja' || value === 'en'
}

export function isLocalePreference(value: unknown): value is LocalePreference {
  return value === 'ja' || value === 'en' || value === 'system'
}

export function parseLocalePreference(value: unknown): LocalePreference {
  return isLocalePreference(value) ? value : DEFAULT_LOCALE_PREFERENCE
}

function supportedLocale(tag: string): AppLocale | null {
  const language = tag.trim().toLowerCase().split('-')[0]
  if (language === 'en' || language === 'ja') return language
  return null
}

// Accept-Language と、navigator.languages から組み立てた同じ形式のどちらも受ける。
// 対応言語が無ければ製品の既定である日本語にする。
export function localeFromAcceptLanguage(header: string | null | undefined): AppLocale {
  if (!header) return 'ja'
  const ranked = header
    .split(',')
    .map((part) => {
      const [rawTag, ...params] = part.trim().split(';')
      const qParam = params.find((param) => param.trim().startsWith('q='))
      const q = qParam ? Number(qParam.trim().slice(2)) : 1
      return {
        tag: rawTag?.trim().toLowerCase() ?? '',
        q: Number.isFinite(q) ? q : 0,
      }
    })
    .filter((item) => item.tag.length > 0 && item.q > 0)
    .sort((a, b) => b.q - a.q)

  for (const { tag } of ranked) {
    const locale = supportedLocale(tag)
    if (locale) return locale
  }
  return 'ja'
}

// 先頭を最優先にし、以降は順位が下がる quality を付ける。
// SSR の Accept-Language とクライアントの言語リストを同じ関数で比べるため。
export function acceptLanguageFromTags(tags: readonly string[] | null | undefined): string | null {
  const languages = (tags ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0)
  if (languages.length === 0) return null
  return languages
    .map((tag, index) => {
      if (index === 0) return tag
      const q = ((languages.length - index) / languages.length).toFixed(3)
      return `${tag};q=${q}`
    })
    .join(',')
}

export function resolveLocale(preference: LocalePreference, acceptLanguage: string | null | undefined): AppLocale {
  if (preference === 'ja' || preference === 'en') return preference
  return localeFromAcceptLanguage(acceptLanguage)
}

export function readLocalePreferenceCookie(cookieHeader: string | null | undefined): LocalePreference {
  if (!cookieHeader) return DEFAULT_LOCALE_PREFERENCE
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${LOCALE_PREFERENCE_COOKIE}=([^;]*)`))
  if (!match?.[1]) return DEFAULT_LOCALE_PREFERENCE
  try {
    return parseLocalePreference(decodeURIComponent(match[1]))
  } catch {
    return DEFAULT_LOCALE_PREFERENCE
  }
}
