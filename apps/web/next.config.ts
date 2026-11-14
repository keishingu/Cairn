// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { NextConfig } from 'next'
import { networkInterfaces } from 'os'

// 実機・シミュレータの WebView から LAN IP 経由でアクセスすると、
// Next.js 15 のデフォルトのクロスオリジン保護で /_next/* がブロックされ
// 画面が真っ白になる（React のハイドレーションが行われない）。
// 開発機の LAN IP を自動検出して許可リストに加える。
function lanDevOrigins(): string[] {
  const origins: string[] = []
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) origins.push(iface.address)
    }
  }
  return origins
}

const nextConfig: NextConfig = {
  transpilePackages: ['@cairn/core', '@cairn/db', '@cairn/shared'],
  allowedDevOrigins: lanDevOrigins(),
  // VERCEL_ENV はクライアントへ自動公開されないため、環境別feature flag用に明示的に渡す。
  env: {
    NEXT_PUBLIC_CAIRN_DEPLOYMENT_ENV: process.env.VERCEL_ENV ?? 'development',
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
      {
        // OAuth の認可・同意画面（MCP の /oauth/authorize、Cairn でログインの /oidc/authorize）を
        // 他サイトの iframe に埋め込ませない。埋め込まれると、透明な枠の上で「許可」を押させる
        // クリックジャッキングで、本人の知らないうちに外部アプリへの許可が出せてしまう
        source: '/oauth/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      {
        source: '/oidc/authorize',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]
  },
}

export default nextConfig
