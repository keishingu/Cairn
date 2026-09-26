// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useT } from '@/components/locale-provider'
import { Icon } from './primitives'
import {
  subscribeToasts, dismissToast, pauseToast, resumeToast,
  type ToastItem, type ToastVariant,
} from '@/lib/toast'

export type ToastPlacement = 'bottom-right' | 'top'

const VARIANT: Record<ToastVariant, { icon: string; color: string; soft: string }> = {
  success: { icon: 'check',         color: 'var(--emerald-text)', soft: 'var(--emerald-soft)' },
  error:   { icon: 'alertTriangle', color: 'var(--red-text)',     soft: 'var(--red-soft)' },
  info:    { icon: 'info',          color: 'var(--accent-text)',  soft: 'var(--accent-soft)' },
}

// globals.css の toast-leave アニメーション長と揃える
const LEAVE_MS = 200

interface RenderedToast {
  item: ToastItem
  leaving: boolean
}

const ToastRow = ({ item, leaving }: RenderedToast) => {
  const t = useT()
  const v = VARIANT[item.variant]
  const isError = item.variant === 'error'
  return (
    <div className="app-toast-slot" data-leaving={leaving || undefined}>
      <div
        className="app-toast"
        role={isError ? 'alert' : 'status'}
        aria-live={isError ? 'assertive' : 'polite'}
        onMouseEnter={() => pauseToast(item.id)}
        onMouseLeave={() => resumeToast(item.id)}
        onFocus={() => pauseToast(item.id)}
        onBlur={() => resumeToast(item.id)}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          width: '100%', boxSizing: 'border-box',
          padding: '10px 8px 10px 12px',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-lg)',
          pointerEvents: leaving ? 'none' : 'auto',
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, flexShrink: 0, borderRadius: '50%',
            background: v.soft, color: v.color,
          }}
        >
          <Icon name={v.icon} size={13} strokeWidth={2.2} />
        </span>
        <span style={{ flex: 1, padding: '2px 0', fontSize: 13, fontWeight: 500, color: 'var(--text)', lineHeight: 1.45, wordBreak: 'break-word' }}>
          {item.message}
        </span>
        <button
          type="button"
          className="app-toast-close"
          onClick={() => dismissToast(item.id)}
          aria-label={t('Close')}
        >
          <Icon name="close" size={13} />
        </button>
      </div>
    </div>
  )
}

/** ストアから消えた行をアニメーションが終わるまで残すため、leaving 状態を付けて保持する。 */
function mergeRendered(prev: RenderedToast[], next: ToastItem[]): RenderedToast[] {
  const nextIds = new Set(next.map(t => t.id))
  const prevIds = new Set(prev.map(r => r.item.id))
  const kept = prev.map(r => (nextIds.has(r.item.id) || r.leaving ? r : { ...r, leaving: true }))
  const added = next.filter(t => !prevIds.has(t.id)).map(item => ({ item, leaving: false }))
  return [...kept, ...added]
}

/**
 * アプリ全体のトースト表示。ルートレイアウトに1つだけマウントする。
 * 表示内容は `@/lib/toast` の `toast.success/error/info` で操作する。
 * PC は右下（チャット入力欄やショートカットヒントの中央下部を塞がない）、
 * モバイルはボトムナビ・入力欄と重ならないよう上部に出す。
 */
export const Toaster = ({ placement = 'bottom-right' }: { placement?: ToastPlacement }) => {
  const [rendered, setRendered] = React.useState<RenderedToast[]>([])

  React.useEffect(() => subscribeToasts(next => setRendered(prev => mergeRendered(prev, next))), [])

  const hasLeaving = rendered.some(r => r.leaving)
  React.useEffect(() => {
    if (!hasLeaving) return
    const timer = setTimeout(() => setRendered(prev => prev.filter(r => !r.leaving)), LEAVE_MS)
    return () => clearTimeout(timer)
  }, [hasLeaving, rendered])

  if (rendered.length === 0) return null

  const isTop = placement === 'top'

  return (
    <div
      className="app-root app-toaster"
      data-placement={placement}
      style={{
        position: 'fixed',
        zIndex: 'var(--z-toast)',
        display: 'flex',
        // 新しいトーストを画面端側に積む
        flexDirection: isTop ? 'column-reverse' : 'column',
        pointerEvents: 'none',
        ...(isTop
          ? {
              top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
              left: 12, right: 12,
              margin: '0 auto', maxWidth: 420,
            }
          : {
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
              right: 20,
              width: 'min(360px, calc(100vw - 40px))',
            }),
      }}
    >
      {rendered.map(r => <ToastRow key={r.item.id} item={r.item} leaving={r.leaving} />)}
    </div>
  )
}
