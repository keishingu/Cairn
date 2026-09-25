// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { readLocalePreferenceCookie, type AppLocale } from '@cairn/shared'

// アカウント作成時だけ、LP やログイン前に選んだ明示ロケールを初期値にする。
// system（未選択）は DB の既定のままブラウザ言語に従わせる。
export function explicitLocaleFromCookie(cookieHeader: string | null): AppLocale | undefined {
  const preference = readLocalePreferenceCookie(cookieHeader)
  return preference === 'ja' || preference === 'en' || preference === 'ko' ? preference : undefined
}
