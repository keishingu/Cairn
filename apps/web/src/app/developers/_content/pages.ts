// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { DocPage, DocsLocale } from '../_components/doc'
import { blocksPage } from './blocks'
import { interactionsPage } from './interactions'
import { modalsPage } from './modals'
import { overviewPage } from './overview'
import { slackDifferencesPage } from './slack-differences'
import { webApiPage } from './web-api'

/** サイドバーと前後のページ送りの順 */
export const DOC_PAGES: DocPage[] = [overviewPage, blocksPage, webApiPage, interactionsPage, modalsPage, slackDifferencesPage]

export const DOCS_LOCALES: DocsLocale[] = ['ja', 'en']

/** 日本語は /developers/<slug>、英語は /developers/en/<slug> */
export function docPath(locale: DocsLocale, slug: string): string {
  const base = locale === 'ja' ? '/developers' : '/developers/en'
  return slug ? `${base}/${slug}` : base
}

/** URL の path セグメントからページを引く。知らないパスは null（404） */
export function resolveDocPath(segments: string[]): { locale: DocsLocale; page: DocPage } | null {
  const [first, ...rest] = segments
  const locale: DocsLocale = first === 'en' ? 'en' : 'ja'
  const slugSegments = first === 'en' ? rest : segments
  if (slugSegments.length > 1) return null
  const slug = slugSegments[0] ?? ''
  const page = DOC_PAGES.find((candidate) => candidate.slug === slug)
  return page ? { locale, page } : null
}
