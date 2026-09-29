// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useT } from '@/components/locale-provider'
import { Icon } from './primitives'

interface InlineErrorProps {
  children: React.ReactNode
  /** text: 入力欄や行の近くに添える赤文字、box: 目立たせたい失敗（送信失敗など）を帯で囲む */
  variant?: 'text' | 'box'
  /** 指定すると閉じるボタンを出す */
  onDismiss?: () => void
  style?: React.CSSProperties
}

/**
 * その場に留めて直す性質のエラー表示。絵文字の「⚠」や個別の赤帯を画面ごとに作らず、これに揃える。
 * 一過性の成功/失敗の通知は `@/lib/toast` を使う。
 */
export const InlineError = ({ children, variant = 'text', onDismiss, style }: InlineErrorProps) => {
  const t = useT()
  const box = variant === 'box'
  return (
    <div
      role="alert"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 6,
        fontSize: 12, lineHeight: 1.5, color: 'var(--red-text)',
        overflowWrap: 'anywhere',
        ...(box ? {
          padding: '6px 8px 6px 10px', borderRadius: 8,
          background: 'var(--red-soft)',
          border: '1px solid color-mix(in srgb, var(--red-text) 25%, transparent)',
        } : {}),
        ...style,
      }}
    >
      <Icon name="alertTriangle" size={13} strokeWidth={2} style={{ marginTop: '0.15em' }} />
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('Close')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 18, height: 18, flexShrink: 0, padding: 0,
            border: 'none', background: 'transparent', borderRadius: 4,
            color: 'inherit', cursor: 'pointer',
          }}
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  )
}
