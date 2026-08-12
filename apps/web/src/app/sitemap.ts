// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { MetadataRoute } from 'next'

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
  ]
}
