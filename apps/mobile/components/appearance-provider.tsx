import React from 'react'
import { AppState, useColorScheme } from 'react-native'
import type { AccentId, AppearanceTheme } from '@cairn/shared'
import { DEFAULT_ACCENT_ID, DEFAULT_APPEARANCE_THEME } from '@cairn/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useMe, type MeDto } from '../hooks/use-account'
import { createThemePalette, type ResolvedTheme, type ThemePalette } from '../lib/theme'

type AppearanceContextValue = {
  palette: ThemePalette
  resolvedTheme: ResolvedTheme
  theme: AppearanceTheme
  accentId: AccentId
  updateAppearance: (appearance: { theme: AppearanceTheme; accentId: AccentId }) => void
}

const defaultPalette = createThemePalette('light', DEFAULT_ACCENT_ID)
const AppearanceContext = React.createContext<AppearanceContextValue>({
  palette: defaultPalette,
  resolvedTheme: 'light',
  theme: DEFAULT_APPEARANCE_THEME,
  accentId: DEFAULT_ACCENT_ID,
  updateAppearance: () => undefined,
})

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const systemTheme = useColorScheme() === 'dark' ? 'dark' : 'light'
  const meQuery = useMe()
  const queryClient = useQueryClient()
  const theme = meQuery.data?.theme ?? DEFAULT_APPEARANCE_THEME
  const accentId = meQuery.data?.accentId ?? DEFAULT_ACCENT_ID
  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme
  const palette = React.useMemo(
    () => createThemePalette(resolvedTheme, accentId),
    [resolvedTheme, accentId],
  )

  // 設定WebViewから戻った場合や別端末で変更した場合も、前面復帰時にDB設定へ追従する。
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void meQuery.refetch()
    })
    return () => sub.remove()
  }, [meQuery.refetch])

  const updateAppearance = React.useCallback(
    (appearance: { theme: AppearanceTheme; accentId: AccentId }) => {
      queryClient.setQueryData<MeDto>(['me'], (current) =>
        current ? { ...current, ...appearance } : current,
      )
    },
    [queryClient],
  )

  const value = React.useMemo(
    () => ({ palette, resolvedTheme, theme, accentId, updateAppearance }),
    [palette, resolvedTheme, theme, accentId, updateAppearance],
  )

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
}

export function useAppAppearance(): AppearanceContextValue {
  return React.useContext(AppearanceContext)
}
