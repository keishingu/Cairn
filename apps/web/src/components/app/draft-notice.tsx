// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useT } from '@/components/locale-provider'

/** 表示モードの欄に添える、未保存の下書きがあることを示す小さな印。 */
export const UnsavedDraftMarker = ({ style }: { style?: React.CSSProperties }) => {
  const t = useT()
  return (
    <span
      style={{
        display: 'inline-block', fontSize: 10.5, fontWeight: 600, lineHeight: 1.4,
        padding: '0 6px', borderRadius: 999, verticalAlign: 'middle',
        color: 'var(--text-3)', background: 'var(--card-hover)', border: '1px solid var(--border)',
        whiteSpace: 'nowrap', ...style,
      }}
    >
      {t('Unsaved draft')}
    </span>
  )
}

/** 下書きを復元したことのお知らせと、破棄（保存済みの値へ戻す）操作。 */
export const DraftNotice = ({
  baseChanged, onDiscard, style,
}: {
  /** 下書きを書き始めてから保存済みの内容が変わっているか */
  baseChanged: boolean
  onDiscard: () => void
  style?: React.CSSProperties
}) => {
  const t = useT()
  return (
    <div
      role="status"
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 8px',
        fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-3)', ...style,
      }}
    >
      <span>
        {t('Restored your unsaved draft.')}
        {baseChanged ? ` ${t('The saved content has changed since you wrote this draft.')}` : ''}
      </span>
      <button
        type="button"
        onClick={onDiscard}
        style={{
          border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 'inherit', color: 'var(--accent)', textDecoration: 'underline',
        }}
      >
        {t('Discard draft')}
      </button>
    </div>
  )
}
