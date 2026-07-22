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
  ]
}
