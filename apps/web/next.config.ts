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
  async rewrites() {
    // トップ（/）では既存の静的 LP（public/lp/index.html）をそのまま配信する。
    // 認証済みユーザーを /projects へ送る分岐は middleware 側で処理する。
    return [{ source: '/', destination: '/lp/index.html' }]
  },
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
