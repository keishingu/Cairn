// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import * as React from 'react'

// タブ復帰時にサーバーを先行ウォームアップする（コールドスタート対策 A-2）。
// タブを数分放置するとサーバーレス関数と DB 接続が冷え、復帰後の初回遷移だけが
// 遅くなる。ユーザーがメニューへ手を伸ばす前に /api/warmup を1本投げて温めておく。
// ルート遷移自体の先読みはサイドバー hover の prefetch（A-1）が担う。
// 設計: docs/performance-improvement-plan.md §2.3

// 連打（頻繁なフォーカス往復）で warmup を撃ちすぎないための最小間隔
const WARMUP_MIN_INTERVAL_MS = 30 * 1000

export function FocusWarmup() {
  const lastWarmupAt = React.useRef(0)

  React.useEffect(() => {
    const warmup = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastWarmupAt.current < WARMUP_MIN_INTERVAL_MS) return
      lastWarmupAt.current = now
      // best-effort。失敗しても UI には影響させない
      void fetch('/api/warmup', { method: 'GET', cache: 'no-store', keepalive: true }).catch(() => {})
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') warmup()
    }

    // visibilitychange: タブ切替からの復帰。focus: 別ウィンドウからの復帰（可視状態は変わらない）
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', warmup)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', warmup)
    }
  }, [])

  return null
}
