// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@cairn/core', '@cairn/db', '@cairn/shared'],
}

export default nextConfig
