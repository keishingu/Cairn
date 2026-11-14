// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export const APPEARANCE_THEMES = ['light', 'system', 'dark'] as const
export type AppearanceTheme = (typeof APPEARANCE_THEMES)[number]

// apps/web/src/lib/accent-presets.ts の ID と同期する。
// API・DB・Expo が同じ許可値を共有し、未知の色名を保存しないための契約。
export const ACCENT_IDS = ['emerald', 'blue', 'violet', 'rose', 'pink', 'amber', 'cyan'] as const
export type AccentId = (typeof ACCENT_IDS)[number]

export const DEFAULT_APPEARANCE_THEME: AppearanceTheme = 'system'
export const DEFAULT_ACCENT_ID: AccentId = 'emerald'

export function isAppearanceTheme(value: unknown): value is AppearanceTheme {
  return APPEARANCE_THEMES.includes(value as AppearanceTheme)
}

export function isAccentId(value: unknown): value is AccentId {
  return ACCENT_IDS.includes(value as AccentId)
}
