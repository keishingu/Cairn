'use client'

import React from 'react'
import { acceptLanguageFromTags, LOCALE_PREFERENCE_COOKIE, resolveLocale, translate, type AppLocale, type LocalePreference } from '@cairn/shared'

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

export function LocaleProvider({ initialLocale, initialPreference, children }: { initialLocale: AppLocale; initialPreference: LocalePreference; children: React.ReactNode }) {
  const [preference, setPreferenceState] = React.useState(initialPreference)
  const [locale, setLocale] = React.useState(initialLocale)

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
