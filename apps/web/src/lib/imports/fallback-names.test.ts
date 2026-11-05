// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { IMPORTED_FALLBACK_NAMES, localizeImportedFallbackName } from './fallback-names'

const t = (key: string) => `t:${key}`

describe('localizeImportedFallbackName', () => {
  test('取り込みの代替名は表示言語の文言にする', () => {
    expect(localizeImportedFallbackName(IMPORTED_FALLBACK_NAMES.anonymous, t)).toBe('t:Unknown poster')
    expect(localizeImportedFallbackName(IMPORTED_FALLBACK_NAMES.exporter, t)).toBe('t:The person who exported')
  })

  test.each(['山田 太郎', 'toString', 'constructor', '__proto__'])('代替名でない名前（%s）はそのまま返す', (name) => {
    expect(localizeImportedFallbackName(name, t)).toBe(name)
  })
})
