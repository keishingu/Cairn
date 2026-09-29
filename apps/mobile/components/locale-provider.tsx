import React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { acceptLanguageFromTags, resolveLocale, translate, type AppLocale, type LocalePreference } from '@cairn/shared'
import { useMe, type MeDto } from '../hooks/use-account'
import { useSession } from '../lib/session-context'

type LocaleContextValue = {
  locale: AppLocale
  preference: LocalePreference
  updateLocale: (locale: LocalePreference) => void
}

const LocaleContext = React.createContext<LocaleContextValue>({
  locale: 'ja',
  preference: 'system',
  updateLocale: () => undefined,
})

function deviceAcceptLanguage(): string | null {
  try {
    return acceptLanguageFromTags([Intl.DateTimeFormat().resolvedOptions().locale])
  } catch {
    return null
  }
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const session = useSession()
  const signedIn = !!session
  const meQuery = useMe(signedIn)
  const queryClient = useQueryClient()
  const preference = signedIn ? (meQuery.data?.locale ?? 'system') : 'system'
  const locale = resolveLocale(preference, deviceAcceptLanguage())

  const updateLocale = React.useCallback(
    (next: LocalePreference) => {
      queryClient.setQueryData<MeDto>(['me'], (current) => (current ? { ...current, locale: next } : current))
    },
    [queryClient],
  )

  const value = React.useMemo(() => ({ locale, preference, updateLocale }), [locale, preference, updateLocale])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useAppLocale(): LocaleContextValue {
  return React.useContext(LocaleContext)
}

export function useT() {
  const { locale } = useAppLocale()
  return React.useCallback((message: string, values?: Record<string, string | number>) => translate(locale, message, values), [locale])
}
