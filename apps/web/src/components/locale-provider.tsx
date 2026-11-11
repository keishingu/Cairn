'use client'

import React from 'react'
import { acceptLanguageFromTags, LOCALE_PREFERENCE_COOKIE, readLocalePreferenceCookie, resolveLocale, translate, type AppLocale, type LocalePreference } from '@cairn/shared'

type LocaleContextValue = {
  locale: AppLocale
  preference: LocalePreference
  setPreference: (preference: LocalePreference) => void
}

const LocaleContext = React.createContext<LocaleContextValue>({
  locale: 'ja',
  preference: 'system',
  setPreference: () => {},
})

function writeLocalePreferenceCookie(preference: LocalePreference) {
  document.cookie = `${LOCALE_PREFERENCE_COOKIE}=${preference};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`
}

function browserAcceptLanguage(): string | null {
  if (typeof navigator === 'undefined') return null
  const tags = navigator.languages?.length
    ? navigator.languages
    : navigator.language
      ? [navigator.language]
      : []
  return acceptLanguageFromTags(tags)
}

export function LocaleProvider({
  initialLocale,
  initialPreference,
  syncFromBrowser = false,
  children,
}: {
  initialLocale: AppLocale
  initialPreference: LocalePreference
  // ルートレイアウトは cookies()/headers() を呼ばない（公開ページを静的に保つ）。
  // 描画前に cookie と navigator.languages で、サーバーが Accept-Language から決めていたのと同じ言語へ合わせる。
  syncFromBrowser?: boolean
  children: React.ReactNode
}) {
  const [preference, setPreferenceState] = React.useState(initialPreference)
  const [locale, setLocale] = React.useState(initialLocale)

  React.useLayoutEffect(() => {
    if (!syncFromBrowser) return
    const nextPreference = readLocalePreferenceCookie(document.cookie)
    const resolved = resolveLocale(nextPreference, browserAcceptLanguage())
    setPreferenceState(nextPreference)
    setLocale(resolved)
    document.documentElement.lang = resolved
  }, [syncFromBrowser])

  const setPreference = React.useCallback((next: LocalePreference) => {
    const resolved = resolveLocale(next, browserAcceptLanguage())
    setPreferenceState(next)
    setLocale(resolved)
    document.documentElement.lang = resolved
    writeLocalePreferenceCookie(next)
  }, [])

  return <LocaleContext.Provider value={{ locale, preference, setPreference }}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleContextValue {
  return React.useContext(LocaleContext)
}

export function useT() {
  const { locale } = useLocale()
  return React.useCallback((message: string, values?: Record<string, string | number>) => translate(locale, message, values), [locale])
}
