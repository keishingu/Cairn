// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@cairn/core', '@cairn/db', '@cairn/shared'],
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ]
  },
}

export default nextConfig
