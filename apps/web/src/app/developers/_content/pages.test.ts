// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { DOC_PAGES, docPath, resolveDocPath } from './pages'

describe('resolveDocPath', () => {
  test('/developers は日本語の概要ページになる', () => {
    const resolved = resolveDocPath([])
    expect(resolved?.locale).toBe('ja')
    expect(resolved?.page.slug).toBe('')
  })

  test('/developers/en/<slug> は英語のページになる', () => {
    const resolved = resolveDocPath(['en', 'web-api'])
    expect(resolved?.locale).toBe('en')
    expect(resolved?.page.slug).toBe('web-api')
  })

  test('知らないパスや深すぎるパスは null を返す', () => {
    expect(resolveDocPath(['unknown'])).toBeNull()
    expect(resolveDocPath(['en', 'blocks', 'extra'])).toBeNull()
    expect(resolveDocPath(['blocks', 'extra'])).toBeNull()
  })

  test('すべてのページが両言語の docPath から引き戻せる', () => {
    for (const page of DOC_PAGES) {
      for (const locale of ['ja', 'en'] as const) {
        const segments = docPath(locale, page.slug).split('/').slice(2)
        expect(resolveDocPath(segments)).toEqual({ locale, page })
      }
    }
  })

  test('両言語で同じ節の ID を持つ（言語を切り替えてもアンカーが残る）', () => {
    for (const page of DOC_PAGES) {
      expect(page.content.en.sections.map((section) => section.id)).toEqual(page.content.ja.sections.map((section) => section.id))
    }
  })
})
