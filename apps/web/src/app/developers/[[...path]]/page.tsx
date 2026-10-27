// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DocsPage } from '../_components/docs-page'
import { DOC_PAGES, DOCS_LOCALES, docPath, resolveDocPath } from '../_content/pages'

// アプリ開発者向けの公開ドキュメント（未ログインで閲覧可。middleware の isDevelopersRoute）。
// 日本語は /developers/<slug>、英語は /developers/en/<slug>。どれもビルド時に静的に作り、知らないパスは 404 にする
export const dynamicParams = false

// LP・sitemap と同じく公開 URL を固定で書く（root layout に metadataBase がないため）
const SITE_URL = 'https://oss-cairn.com'

type Params = { path?: string[] }

export function generateStaticParams(): Params[] {
  return DOCS_LOCALES.flatMap((locale) =>
    DOC_PAGES.map((page) => {
      const segments = docPath(locale, page.slug).split('/').slice(2)
      return { path: segments }
    }),
  )
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const resolved = resolveDocPath((await params).path ?? [])
  if (!resolved) return {}
  const { locale, page } = resolved
  const content = page.content[locale]
  return {
    title: `${content.title} | Cairn Developers`,
    description: content.description,
    alternates: {
      canonical: `${SITE_URL}${docPath(locale, page.slug)}`,
      languages: { ja: `${SITE_URL}${docPath('ja', page.slug)}`, en: `${SITE_URL}${docPath('en', page.slug)}` },
    },
  }
}

export default async function DevelopersPage({ params }: { params: Promise<Params> }) {
  const resolved = resolveDocPath((await params).path ?? [])
  if (!resolved) notFound()
  return <DocsPage locale={resolved.locale} page={resolved.page} />
}
