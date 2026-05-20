// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { ACCENT_PRESETS, DEFAULT_ACCENT_ID, ACCENT_STORAGE_KEY } from '@/lib/accent-presets'

type AccentColorContextType = {
  accentId: string
  setAccentId: (id: string) => void
}

export const AccentColorContext = React.createContext<AccentColorContextType>({
  accentId: DEFAULT_ACCENT_ID,
  setAccentId: () => {},
})

export function useAccentColor() {
  return React.useContext(AccentColorContext)
}

export function AccentColorProvider({ children }: { children: React.ReactNode }) {
  const [accentId, setAccentIdState] = React.useState(DEFAULT_ACCENT_ID)

  React.useEffect(() => {
    const stored = localStorage.getItem(ACCENT_STORAGE_KEY) ?? DEFAULT_ACCENT_ID
    setAccentIdState(stored)
  }, [])

  function setAccentId(id: string) {
    localStorage.setItem(ACCENT_STORAGE_KEY, id)
    setAccentIdState(id)
  }

  const preset = ACCENT_PRESETS.find(p => p.id === accentId) ?? ACCENT_PRESETS[0]!
  const isDefault = accentId === DEFAULT_ACCENT_ID

  return (
    <AccentColorContext.Provider value={{ accentId, setAccentId }}>
      {!isDefault && (
        <style key={`accent-${accentId}`}>{`
          .app-root {
            --accent:      ${preset.light.accent};
            --accent-hover:  ${preset.light.accentHover};
            --accent-soft:   ${preset.light.accentSoft};
            --accent-soft-2: ${preset.light.accentSoft2};
            --accent-text:   ${preset.light.accentText};
            --on-accent:     ${preset.light.onAccent};
            --selection:     ${preset.light.selection};
            --ring:          ${preset.light.ring};
          }
          [data-theme="dark"] .app-root {
            --accent:      ${preset.dark.accent};
            --accent-hover:  ${preset.dark.accentHover};
            --accent-soft:   ${preset.dark.accentSoft};
            --accent-soft-2: ${preset.dark.accentSoft2};
            --accent-text:   ${preset.dark.accentText};
            --on-accent:     ${preset.dark.onAccent};
            --selection:     ${preset.dark.selection};
            --ring:          ${preset.dark.ring};
          }
        `}</style>
      )}
      {children}
    </AccentColorContext.Provider>
  )
}
