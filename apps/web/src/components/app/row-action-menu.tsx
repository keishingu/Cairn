'use client'

import React from 'react'
import { Icon } from './primitives'

export interface RowAction {
  icon: string
  label: string
  danger?: boolean
  onSelect: () => void
}

// リスト行の「…」アクションメニュー。リスト系エンティティの編集・削除は
// ホバー依存の小アイコンではなく、常時表示のこのメニューに統一する
export const RowActionMenu = ({ actions, triggerStyle }: {
  actions: RowAction[]
  triggerStyle?: React.CSSProperties
}) => {
  const [open, setOpen] = React.useState(false)
  const [position, setPosition] = React.useState({ top: 0, right: 0 })
  const btnRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const menuId = React.useId()

  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      btnRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // overflow を持つスクロールコンテナ内でも切れないよう fixed で配置する
  const menuStyle: React.CSSProperties = { position: 'fixed', ...position, zIndex: 300, minWidth: 120 }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={btnRef}
        type="button"
        aria-label="操作"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={e => {
          e.preventDefault()
          e.stopPropagation()
          const rect = e.currentTarget.getBoundingClientRect()
          setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
          setOpen(p => !p)
        }}
        style={{ border: 'none', background: open ? 'var(--card-hover)' : 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: '3px 5px', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', ...triggerStyle }}
        title="操作"
      >
        <Icon name="more" size={15}/>
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          onClick={e => e.stopPropagation()}
          style={{ ...menuStyle, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', padding: '4px 0' }}
        >
          {actions.map(a => (
            <button
              key={a.label}
              type="button"
              onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(false); btnRef.current?.focus(); a.onSelect() }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', border: 'none', background: 'transparent', color: a.danger ? 'var(--red-text)' : 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', whiteSpace: 'nowrap' }}
            >
              <Icon name={a.icon} size={13}/> {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
