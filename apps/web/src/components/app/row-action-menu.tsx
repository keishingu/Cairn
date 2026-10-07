'use client'

import React from 'react'
import { useT } from '@/components/locale-provider'
import { Icon } from './primitives'

export interface RowAction {
  icon: string
  label: string
  danger?: boolean
  onSelect: () => void
}

const MENU_GAP = 4

/**
 * メニューの縦位置。トリガーの下に収まらなければ上へ出し、上下どちらにも収まらなければ画面内に寄せる。
 * 常に下へ出すと、画面下端に近い行（チャットの最新メッセージなど）で下の項目が画面外に切れて押せない。
 */
export function placeMenuVertically(
  trigger: { top: number; bottom: number },
  menuHeight: number,
  // 実際に見えている範囲（fixed 配置と同じ座標系）。ソフトウェアキーボードが出ている間は画面全体より狭い
  visible: { top: number; bottom: number },
  // ノッチやホームインジケーターに隠れる領域。viewport-fit=cover のため、画面端まで使うと最後の項目が隠れる
  safeArea: { top: number; bottom: number } = { top: 0, bottom: 0 },
): number {
  const minTop = visible.top + safeArea.top + MENU_GAP
  const maxBottom = visible.bottom - safeArea.bottom - MENU_GAP
  const below = trigger.bottom + MENU_GAP
  if (below + menuHeight <= maxBottom) return below
  const above = trigger.top - MENU_GAP - menuHeight
  if (above >= minTop) return above
  return Math.max(minTop, maxBottom - menuHeight)
}

// リスト行の「…」アクションメニュー。リスト系エンティティの編集・削除は
// ホバー依存の小アイコンではなく、常時表示のこのメニューに統一する
export const RowActionMenu = ({ actions, triggerStyle }: {
  actions: RowAction[]
  triggerStyle?: React.CSSProperties
}) => {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const [position, setPosition] = React.useState<{ top: number; right: number; maxHeight?: number }>({ top: 0, right: 0 })
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

  // 開いた直後に実際の高さを測り、画面に収まる位置へ描画前に直す。
  // 開いたまま画面の回転やキーボードの開閉で見える範囲が変わると位置が古くなるため、その都度測り直す
  React.useLayoutEffect(() => {
    if (!open) return
    const reposition = () => {
      if (!btnRef.current || !menuRef.current) return
      const rect = btnRef.current.getBoundingClientRect()
      // env(safe-area-inset-*) は JS から直接読めないため、レイアウトに影響しない scroll-margin に入れて px に解決させる
      const computed = getComputedStyle(menuRef.current)
      const safeArea = { top: parseFloat(computed.scrollMarginTop) || 0, bottom: parseFloat(computed.scrollMarginBottom) || 0 }
      // iOS のキーボードは window.innerHeight を縮めないため、visualViewport があればそちらを見える範囲とする
      const viewport = window.visualViewport
      const visible = viewport
        ? { top: viewport.offsetTop, bottom: viewport.offsetTop + viewport.height }
        : { top: 0, bottom: window.innerHeight }
      const maxHeight = Math.max(0, visible.bottom - visible.top - safeArea.top - safeArea.bottom - MENU_GAP * 2)
      const top = placeMenuVertically(rect, Math.min(menuRef.current.scrollHeight, maxHeight), visible, safeArea)
      const right = window.innerWidth - rect.right
      setPosition(current => current.top === top && current.right === right && current.maxHeight === maxHeight ? current : { top, right, maxHeight })
    }
    reposition()
    const viewport = window.visualViewport
    window.addEventListener('resize', reposition)
    viewport?.addEventListener('resize', reposition)
    viewport?.addEventListener('scroll', reposition)
    return () => {
      window.removeEventListener('resize', reposition)
      viewport?.removeEventListener('resize', reposition)
      viewport?.removeEventListener('scroll', reposition)
    }
  }, [open, actions.length])

  // overflow を持つスクロールコンテナ内でも切れないよう fixed で配置する
  const menuStyle: React.CSSProperties = { position: 'fixed', ...position, zIndex: 'var(--z-popover)', minWidth: 120, overflowY: 'auto', scrollMarginTop: 'env(safe-area-inset-top)', scrollMarginBottom: 'env(safe-area-inset-bottom)' }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={btnRef}
        type="button"
        aria-label={t('Actions')}
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
        title={t('Actions')}
      >
        <Icon name="more" size={15}/>
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          onClick={e => e.stopPropagation()}
          style={{ ...menuStyle, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-lg)', padding: '4px 0' }}
        >
          {actions.map(a => (
            <button
              key={a.label}
              type="button"
              onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(false); btnRef.current?.focus(); a.onSelect() }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', border: 'none', background: 'transparent', color: a.danger ? 'var(--red-text)' : 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', whiteSpace: 'nowrap' }}
            >
              <Icon name={a.icon} size={13}/> {t(a.label)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
