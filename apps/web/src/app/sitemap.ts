// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { MetadataRoute } from 'next'
import { DOC_PAGES, DOCS_LOCALES, docPath } from './developers/_content/pages'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://oss-cairn.com/',
      lastModified: new Date('2026-07-03'),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: 'https://oss-cairn.com/privacy',
      lastModified: new Date('2026-08-09'),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: 'https://oss-cairn.com/terms',
      lastModified: new Date('2026-08-09'),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    ...DOCS_LOCALES.flatMap((locale) =>
      DOC_PAGES.map((page) => ({
        url: `https://oss-cairn.com${docPath(locale, page.slug)}`,
        lastModified: new Date('2026-10-23'),
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      })),
    ),
  ]
}
