// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/chats', '/projects', '/settings', '/tasks', '/files', '/gallery', '/ai', '/auth'],
    },
    sitemap: 'https://oss-cairn.com/sitemap.xml',
  }
}
