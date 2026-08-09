// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { Icon } from './primitives'
import { subscribeToasts, dismissToast, type ToastItem, type ToastVariant } from '@/lib/toast'

const VARIANT: Record<ToastVariant, { icon: string; background: string; border: string; iconColor: string }> = {
  success: {
    icon: 'check',
    background: 'color-mix(in srgb, var(--card) 90%, var(--emerald))',
    border: 'color-mix(in srgb, var(--border) 65%, var(--emerald))',
    iconColor: 'var(--emerald-text)',
  },
  error: {
    icon: 'alertTriangle',
    background: 'color-mix(in srgb, var(--card) 90%, var(--red))',
    border: 'color-mix(in srgb, var(--border) 65%, var(--red))',
    iconColor: 'var(--red-text)',
  },
  info: {
    icon: 'bell',
    background: 'color-mix(in srgb, var(--card) 90%, var(--accent))',
    border: 'color-mix(in srgb, var(--border) 65%, var(--accent))',
    iconColor: 'var(--accent-text)',
  },
}

const ToastRow = ({ item }: { item: ToastItem }) => {
  const v = VARIANT[item.variant]
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        minWidth: 240, maxWidth: 'min(420px, 90vw)',
        padding: '11px 12px 11px 14px',
        background: v.background,
        border: `1px solid ${v.border}`,
        borderRadius: 10,
        boxShadow: 'var(--shadow)',
        pointerEvents: 'auto',
      }}
    >
      <Icon name={v.icon} size={15} color={v.iconColor} />
      <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', lineHeight: 1.45, wordBreak: 'break-word' }}>
        {item.message}
      </span>
      <button
        onClick={() => dismissToast(item.id)}
        aria-label="閉じる"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, flexShrink: 0,
          border: 'none', background: 'transparent', borderRadius: 6,
          color: 'var(--text-4)', cursor: 'pointer',
        }}
      >
        <Icon name="close" size={13} />
      </button>
    </div>
  )
}

/**
 * アプリ全体のトースト表示。ルートレイアウトに1つだけマウントする。
 * 表示内容は `@/lib/toast` の `toast.success/error/info` で操作する。
 */
export const Toaster = () => {
  const [items, setItems] = React.useState<ToastItem[]>([])

  React.useEffect(() => subscribeToasts(setItems), [])

  if (items.length === 0) return null

  return (
    <div
      className="app-root"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
        pointerEvents: 'none',
      }}
    >
      {items.map(item => <ToastRow key={item.id} item={item} />)}
    </div>
  )
}
