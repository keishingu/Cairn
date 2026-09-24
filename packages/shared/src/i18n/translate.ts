// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { AppLocale } from '../config/locale'
import { JA_MESSAGES } from './ja'

export function translate(
  locale: AppLocale,
  message: string,
  values?: Record<string, string | number>,
): string {
  const template = locale === 'ja' ? (JA_MESSAGES[message] ?? message) : message
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (token, key: string) => {
    const value = values[key]
    return value === undefined ? token : String(value)
  })
}
