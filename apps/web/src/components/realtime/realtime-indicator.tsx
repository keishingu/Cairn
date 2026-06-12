// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useRealtime } from './realtime-provider'

// Realtime が一定時間復帰できないとき「再接続中…」を表示する。
// 更新が止まっているのではなく接続が切れていることをユーザーに見せる（障害を隠さない）
export function RealtimeIndicator() {
  const { degraded } = useRealtime()
  if (!degraded) return null

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: 'calc(16px + env(safe-area-inset-bottom))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 14px',
        borderRadius: 999,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)',
        fontSize: 12.5,
        fontWeight: 600,
        color: 'var(--text-2)',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--amber)',
          animation: 'realtimePulse 1.2s ease-in-out infinite',
        }}
      />
      再接続中…
      <style>{`@keyframes realtimePulse { 0%,100% { opacity: 1 } 50% { opacity: .3 } }`}</style>
    </div>
  )
}
