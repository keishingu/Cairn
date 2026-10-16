'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import {
  filterReactionEmojis,
  isVerticalSheetDrag,
  quickReactions,
  reactionSheetSwipe,
  REACTION_EMOJI_CATEGORY_LABELS,
  SKIN_TONE_SAMPLES,
  type ReactionEmojiCatalog,
} from '@cairn/shared'
import { useT } from '@/components/locale-provider'
import { useReactionHistory } from '@/hooks/use-reaction-history'
import { Icon, Modal, portalHostFor } from './primitives'
import { placeMenuVertically } from './row-action-menu'

const POPOVER_WIDTH = 340
const MARGIN = 6

// 絵文字データは数百 KB あるため、「もっと見る」を開いたときに初めて読み込む
let catalogPromise: Promise<ReactionEmojiCatalog> | null = null
function loadCatalog() {
  catalogPromise ??= import('@emoji-mart/data')
    .then(module => (module.default ?? module) as unknown as ReactionEmojiCatalog)
    .catch(error => {
      catalogPromise = null
      throw error
    })
  return catalogPromise
}

interface ReactionPickerProps {
  anchorRef: React.RefObject<HTMLElement | null>
  onSelect: (emoji: string) => void
  onClose: () => void
  /** モバイル Web は下からのシート、PC はボタン付近のポップオーバー */
  isMobile?: boolean
}

/**
 * リアクションの絵文字選択。最近使った絵文字（足りない分は既定の絵文字）を先頭に並べ、
 * 「もっと見る」で検索・カテゴリ・肌の色つきの全絵文字を開く。アプリの ReactionPicker と同じ構成。
 */
export const ReactionPicker = ({ anchorRef, onSelect, onClose, isMobile = false }: ReactionPickerProps) => {
  const t = useT()
  const history = useReactionHistory()
  const [expanded, setExpanded] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [category, setCategory] = React.useState('people')
  const [tone, setTone] = React.useState(0)
  const [catalog, setCatalog] = React.useState<ReactionEmojiCatalog | null>(null)
  const [catalogError, setCatalogError] = React.useState(false)
  const [catalogAttempt, setCatalogAttempt] = React.useState(0)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [host, setHost] = React.useState<HTMLElement | null>(null)
  const [popoverPos, setPopoverPos] = React.useState<{ top: number; left: number } | null>(null)

  React.useLayoutEffect(() => {
    setHost(portalHostFor(anchorRef.current) ?? document.body)
  }, [anchorRef])

  React.useEffect(() => {
    if (!expanded || catalog) return
    let cancelled = false
    setCatalogError(false)
    loadCatalog().then(
      loaded => { if (!cancelled) setCatalog(loaded) },
      () => { if (!cancelled) setCatalogError(true) },
    )
    return () => { cancelled = true }
  }, [expanded, catalog, catalogAttempt])

  // PC: ボタンの下に収まらなければ上へ出す。開閉で高さが変わるたびに測り直す
  React.useLayoutEffect(() => {
    if (isMobile || !host || !anchorRef.current || !containerRef.current) return
    const reposition = () => {
      if (!anchorRef.current || !containerRef.current) return
      const rect = anchorRef.current.getBoundingClientRect()
      const top = placeMenuVertically(rect, containerRef.current.offsetHeight, { top: 0, bottom: window.innerHeight })
      const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - MARGIN))
      setPopoverPos(current => current && current.top === top && current.left === left ? current : { top, left })
    }
    reposition()
    window.addEventListener('resize', reposition)
    return () => window.removeEventListener('resize', reposition)
  }, [anchorRef, host, isMobile, expanded, catalog, catalogError])

  React.useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (containerRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
      anchorRef.current?.focus()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [anchorRef, onClose])

  // モバイル: シート上部の縦スワイプ。上へ払えば全絵文字を開き、下へ払えばたたむ（たたんだ状態なら閉じる）
  const drag = React.useRef<{ x: number; y: number; time: number; active: boolean } | null>(null)
  const suppressClick = React.useRef(false)
  const [dragY, setDragY] = React.useState(0)
  const swipeHandlers = isMobile ? {
    onPointerDown: (e: React.PointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY, time: e.timeStamp, active: false }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const current = drag.current
      if (!current) return
      const dx = e.clientX - current.x
      const dy = e.clientY - current.y
      if (!current.active && isVerticalSheetDrag(dx, dy)) {
        current.active = true
        // 指がシートの外へ出ても追従させる。ポインタが既に離れていると例外になるため、取れなくてもドラッグは続ける
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ }
      }
      if (current.active) setDragY(Math.max(0, dy))
    },
    onPointerUp: (e: React.PointerEvent) => {
      const current = drag.current
      drag.current = null
      setDragY(0)
      if (!current?.active) return
      // ドラッグの後に発火するクリックで絵文字を選ばない
      suppressClick.current = true
      const dy = e.clientY - current.y
      const action = reactionSheetSwipe(dy, dy / Math.max(1, e.timeStamp - current.time), expanded)
      if (action === 'expand') setExpanded(true)
      else if (action === 'collapse') setExpanded(false)
      else if (action === 'close') onClose()
    },
    onPointerCancel: () => { drag.current = null; setDragY(0) },
    onClickCapture: (e: React.MouseEvent) => {
      if (!suppressClick.current) return
      suppressClick.current = false
      e.stopPropagation()
      e.preventDefault()
    },
  } : {}

  const searching = search.trim().length > 0
  const entries = React.useMemo(
    () => (catalog ? filterReactionEmojis(catalog, search, category, tone) : []),
    [catalog, search, category, tone],
  )
  const select = (emoji: string) => { onSelect(emoji); onClose() }

  if (!host) return null

  const chipButton: React.CSSProperties = {
    border: 'none', borderRadius: 10, background: 'var(--card-2)', cursor: 'pointer', fontFamily: 'inherit',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation',
  }

  const body = (
    <>
      <div {...swipeHandlers} style={isMobile ? { touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' } : undefined}>
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 2px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-2)' }}/>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '4px 16px 8px' : '10px 12px 8px' }}>
          <span style={{ fontSize: isMobile ? 15 : 13, fontWeight: 700, color: 'var(--text)' }}>{t('Reaction')}</span>
          <button type="button" aria-label={t('Close')} onClick={onClose} className="icon-btn icon-btn-sm">
            <Icon name="close" size={14}/>
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, padding: isMobile ? '0 16px' : '0 12px' }}>
          {quickReactions(history.recent).map(emoji => (
            <button
              key={emoji}
              type="button"
              aria-label={t('Add {emoji}', { emoji })}
              onClick={() => select(emoji)}
              style={{ ...chipButton, height: isMobile ? 48 : 40, fontSize: isMobile ? 24 : 20 }}
            >{emoji}</button>
          ))}
        </div>
        {history.error && (
          <div role="alert" style={{ padding: isMobile ? '6px 16px 0' : '6px 12px 0', fontSize: 12, color: 'var(--red-text)' }}>
            {t('Could not load recent reactions')}
          </div>
        )}
        {/* 「+」だけでは他の絵文字を選べると伝わりにくいため、文言付きの全幅ボタンにする。モバイルは上スワイプでも開ける */}
        <div style={{ padding: isMobile ? '8px 16px 0' : '8px 12px 0' }}>
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(value => !value)}
            style={{ ...chipButton, width: '100%', height: isMobile ? 44 : 34, gap: 4, color: 'var(--text-2)', fontSize: 13, fontWeight: 600 }}
          >
            {expanded ? t('Show less') : t('Show more')}
            <Icon name={expanded ? 'chevDown' : 'chevUp'} size={14}/>
          </button>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: isMobile ? '10px 16px 0' : '10px 12px 0', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {catalogError ? (
            <div role="alert" style={{ fontSize: 12.5, color: 'var(--red-text)', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              {t('Could not load the emoji list')}
              <button type="button" className="btn" onClick={() => { setCatalogError(false); setCatalogAttempt(n => n + 1) }}>{t('Retry')}</button>
            </div>
          ) : !catalog ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '8px 0' }}>{t('Loading…')}</div>
          ) : (
            <>
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('Search by English name or emoji')}
                aria-label={t('Search by English name or emoji')}
                autoFocus={!isMobile}
                className="form-control"
                style={{ height: 34 }}
              />
              <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none', padding: '8px 0 6px', flexShrink: 0 }}>
                {catalog.categories.map(item => {
                  const selected = category === item.id && !searching
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => { setCategory(item.id); setSearch('') }}
                      style={{ ...chipButton, flexShrink: 0, height: 28, padding: '0 10px', fontSize: 12, whiteSpace: 'nowrap', color: selected ? 'var(--accent-text)' : 'var(--text-2)', background: selected ? 'var(--accent-soft)' : 'var(--card-2)' }}
                    >{t(REACTION_EMOJI_CATEGORY_LABELS[item.id] ?? item.id)}</button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 4, paddingBottom: 6 }}>
                {SKIN_TONE_SAMPLES.map((emoji, index) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={t('Skin tone {number}', { number: index + 1 })}
                    aria-pressed={tone === index}
                    onClick={() => setTone(index)}
                    style={{ ...chipButton, width: 30, height: 28, fontSize: 16, background: tone === index ? 'var(--accent-soft)' : 'var(--card-2)' }}
                  >{emoji}</button>
                ))}
              </div>
              <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', height: isMobile ? 260 : 220 }}>
                {entries.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '8px 0' }}>{t('No emoji found')}</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)' }}>
                    {entries.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        aria-label={t('Add {emoji}', { emoji: item.native })}
                        title={item.name}
                        onClick={() => select(item.native)}
                        className="reaction-picker-cell"
                        style={{ border: 'none', background: 'transparent', borderRadius: 8, height: 38, fontSize: 22, cursor: 'pointer', padding: 0 }}
                      >{item.native}</button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  )

  if (isMobile) {
    // 共通の Modal に載せ、背後のチャットへのフォーカス移動・読み上げを防ぎ、閉じたら「+」へフォーカスを戻す
    return (
      <Modal onClose={onClose} label={t('Reaction')}>
        <div
          ref={containerRef}
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            background: 'var(--card)', borderTopLeftRadius: 20, borderTopRightRadius: 20, boxShadow: 'var(--shadow-sheet)',
            maxHeight: '90dvh', display: 'flex', flexDirection: 'column',
            paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
            transform: dragY ? `translateY(${dragY}px)` : undefined,
            transition: dragY ? 'none' : 'transform .18s ease',
            animation: 'slideUpSheet .22s cubic-bezier(.2,.7,.3,1)',
          }}
        >
          {body}
        </div>
      </Modal>
    )
  }

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-label={t('Reaction')}
      style={{
        position: 'fixed', top: popoverPos?.top ?? 0, left: popoverPos?.left ?? 0, width: POPOVER_WIDTH,
        visibility: popoverPos ? undefined : 'hidden',
        zIndex: 'var(--z-popover)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
        boxShadow: 'var(--shadow-lg)', paddingBottom: 12, display: 'flex', flexDirection: 'column',
      }}
    >
      {body}
    </div>,
    host,
  )
}
