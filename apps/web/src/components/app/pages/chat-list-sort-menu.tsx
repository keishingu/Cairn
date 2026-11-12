'use client'

import React from 'react'
import { CHAT_LIST_SECTION_SORTS, CHAT_LIST_SORT_LABELS, DEFAULT_CHAT_LIST_SORTS, type ChatListSection, type ChatListSort } from '@cairn/shared'
import { useT } from '@/components/locale-provider'
import { Icon } from '../primitives'

/**
 * セクション見出しの「＋」の左に置く並び替えボタン。見た目は「＋」と同じ ghost。
 * 既定以外を選んでいる間はアイコンを accent 色にして、並びが変わっていることを示す
 */
export const ChatListSortMenu = ({ section, title, sort, onChange }: {
  section: ChatListSection
  /** セクションの見出し（読み上げとツールチップに使う） */
  title: string
  sort: ChatListSort
  onChange: (sort: ChatListSort) => void
}) => {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const handlePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const label = t('Sort {title}', { title })
  const customized = sort !== DEFAULT_CHAT_LIST_SORTS[section]
  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen(previous => !previous)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={`${label}: ${t(CHAT_LIST_SORT_LABELS[sort])}`}
        className="hover-bg-card hover-text"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 20, height: 20, borderRadius: 6, flexShrink: 0, padding: 0, border: 'none', cursor: 'pointer',
          background: open ? 'var(--card-hover)' : 'transparent',
          color: customized ? 'var(--accent-text)' : 'var(--text-4)',
        }}
      >
        <Icon name="sort" size={13} strokeWidth={2.2} color="currentColor"/>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', right: 0, minWidth: 150, zIndex: 'var(--z-dropdown)',
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-pop)', padding: 6,
            textTransform: 'none', letterSpacing: 'normal',
          }}
        >
          {CHAT_LIST_SECTION_SORTS[section].map(option => (
            <button
              key={option}
              role="menuitemradio"
              aria-checked={sort === option}
              onClick={() => { onChange(option); setOpen(false) }}
              className="hover-bg-card"
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, border: 'none',
                background: 'transparent', color: 'var(--text)', fontSize: 'var(--fs-md)', fontWeight: 400, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ width: 14, display: 'inline-flex', color: 'var(--accent-text)' }}>
                {sort === option && <Icon name="check" size={13} strokeWidth={2.4}/>}
              </span>
              {t(CHAT_LIST_SORT_LABELS[option])}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
