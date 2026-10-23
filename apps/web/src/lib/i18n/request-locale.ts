// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { cookies, headers } from 'next/headers'
import {
  LOCALE_PREFERENCE_COOKIE,
  parseLocalePreference,
  resolveLocale,
  type AppLocale,
  type LocalePreference,
} from '@cairn/shared'

export async function readRequestLocale(): Promise<{
  preference: LocalePreference
  locale: AppLocale
}> {
  const cookieStore = await cookies()
  const headerStore = await headers()
  const preference = parseLocalePreference(cookieStore.get(LOCALE_PREFERENCE_COOKIE)?.value)
  return {
    preference,
    locale: resolveLocale(preference, headerStore.get('accept-language')),
  }
}
