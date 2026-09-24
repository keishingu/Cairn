'use client'

import React from 'react'
import { LOCALE_PREFERENCE_COOKIE, resolveLocale, translate, type AppLocale, type LocalePreference } from '@cairn/shared'

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

export function LocaleProvider({ initialLocale, initialPreference, children }: { initialLocale: AppLocale; initialPreference: LocalePreference; children: React.ReactNode }) {
  const [preference, setPreferenceState] = React.useState(initialPreference)
  const [locale, setLocale] = React.useState(initialLocale)

  const setPreference = React.useCallback((next: LocalePreference) => {
    const language = typeof navigator === 'undefined' ? null : navigator.language
    const resolved = resolveLocale(next, language)
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
