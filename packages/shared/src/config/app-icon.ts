// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import {
  DEFAULT_ACCENT_ID,
  DEFAULT_APPEARANCE_THEME,
  type AccentId,
  type AppearanceTheme,
} from './appearance'

export type ResolvedAppearanceTheme = 'light' | 'dark'

export type AppIconVariant = {
  accentId: AccentId
  theme: ResolvedAppearanceTheme
}

export type AppDeploymentEnvironment = 'development' | 'preview' | 'production'

// 開発系ビルドと本番を見分けられるよう、未ログイン時・初期設定時のアイコンと配色を環境で変える。
// apps/desktop/src/app-icon.js の DEFAULT_VARIANTS と同期する。
export const DEFAULT_APP_ICON_VARIANTS: Record<AppDeploymentEnvironment, AppIconVariant> = {
  development: { accentId: 'blue', theme: 'light' },
  preview: { accentId: 'blue', theme: 'light' },
  production: { accentId: 'emerald', theme: 'dark' },
}

/**
 * 外観設定から表示すべきアプリアイコンを決める。
 * DB の初期値（システム＋エメラルド）は未設定と区別できないため、初期値のままなら環境別の既定を使う。
 */
export function resolveAppIconVariant(input: {
  theme: AppearanceTheme
  accentId: AccentId
  systemTheme: ResolvedAppearanceTheme
  defaultVariant: AppIconVariant
}): AppIconVariant {
  if (input.theme === DEFAULT_APPEARANCE_THEME && input.accentId === DEFAULT_ACCENT_ID) {
    return input.defaultVariant
  }
  return {
    accentId: input.accentId,
    theme: input.theme === 'system' ? input.systemTheme : input.theme,
  }
}

export function appIconVariantName(variant: AppIconVariant): string {
  return `${variant.accentId}-${variant.theme}`
}
