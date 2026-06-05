'use client'

import React from 'react'

interface PageToolbarProps {
  left?: React.ReactNode
  right?: React.ReactNode
  style?: React.CSSProperties
}

/**
 * 2ゾーン構造のツールバーレイアウト。
 * 左ゾーム: コンテキスト操作（タブ・ナビ・グループ指定など）。コンテンツ超過時は横スクロール。
 * 右ゾーン: ビュー操作（フィルター・ビュー切替・主要アクション）。常に表示を維持。
 */
export const PageToolbar = ({ left, right, style }: PageToolbarProps) => (
  <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, ...style }}>
    <div style={{
      flex: 1,
      minWidth: 0,
      display: 'flex',
      alignItems: 'center',
      overflowX: 'auto',
      scrollbarWidth: 'none',
    }}>
      {left}
    </div>
    {right != null && (
      <div style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        {right}
      </div>
    )}
  </div>
)

interface SegmentedControlOption {
  id: string
  label: string
  icon?: React.ReactNode
}

interface SegmentedControlProps {
  options: SegmentedControlOption[]
  value: string
  onChange: (value: string) => void
}

export const SegmentedControl = ({ options, value, onChange }: SegmentedControlProps) => (
  <div style={{
    display: 'flex',
    background: 'var(--card-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 2,
  }}>
    {options.map(opt => (
      <button
        key={opt.id}
        onClick={() => onChange(opt.id)}
        style={{
          padding: '5px 10px',
          borderRadius: 6,
          border: 'none',
          background: value === opt.id ? 'var(--card)' : 'transparent',
          color: value === opt.id ? 'var(--text)' : 'var(--text-3)',
          fontSize: 12,
          fontWeight: value === opt.id ? 600 : 500,
          cursor: 'pointer',
          fontFamily: 'inherit',
          boxShadow: value === opt.id ? 'var(--shadow-sm)' : 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          whiteSpace: 'nowrap',
        }}
      >
        {opt.icon}
        {opt.label}
      </button>
    ))}
  </div>
)
