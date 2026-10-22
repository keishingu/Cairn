// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { displayAppName, appAddErrorMessage, cardActionErrorMessage } from '@cairn/shared'
import { useT } from '@/components/locale-provider'
import { Icon, Modal } from '@/components/app/primitives'
import { useAppEntryPoints } from '@/hooks/use-app-entry-points'
import type { AppEntryPointDto } from '@/app/api/channels/[channelId]/app-entry-points/route'

// 入力欄の「アプリ」から選ぶアプリの起動口（docs/app-platform-design.md §6.1）。アプリが増えても入力欄の幅を取らないよう、
// 起動口はボタン1つのメニューにまとめる。選ぶとスラッシュコマンドと同じ形でアプリへ届き、アプリはモーダルを開くなどして応える。
// Bot がまだチャンネルにいなければ、起動の前に追加を確かめる（§11 D7）

type PendingEntry = { app: AppEntryPointDto; command: string }

const MENU_WIDTH = 240
const MENU_ITEM_HEIGHT = 34

export function AppEntryButtons({ channelId, onError, compact, iconOnly }: { channelId: string; onError: (message: string | null) => void; compact?: boolean; iconOnly?: boolean }) {
  const t = useT()
  const { query, invoke: invokeEntry, busy } = useAppEntryPoints(channelId)
  const [confirming, setConfirming] = React.useState<PendingEntry | null>(null)
  const [menuPosition, setMenuPosition] = React.useState<{ left: number; top: number } | null>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const closeMenu = React.useCallback(() => setMenuPosition(null), [])

  React.useEffect(() => {
    if (!menuPosition) return
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) closeMenu()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      closeMenu()
      buttonRef.current?.focus()
    }
    window.addEventListener('resize', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeMenu, menuPosition])

  const invoke = async ({ app, command }: PendingEntry) => {
    onError(null)
    const failure = await invokeEntry(app, command)
    if (!failure) return
    // 追加 API の本文は日本語固定なので見せず、状態コードから表示言語の案内にする
    onError(t(failure.step === 'add' ? appAddErrorMessage(failure.status) : cardActionErrorMessage(failure.code)))
  }

  const buttonStyle: React.CSSProperties = compact || iconOnly
    ? { border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: compact ? 2 : '4px 6px', borderRadius: 5, display: 'inline-flex', alignItems: 'center' }
    : { border: 'none', background: 'transparent', padding: '4px 8px', borderRadius: 5, color: 'var(--text-3)', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }

  if (query.isError) {
    // 読み込めなかったことを黙って隠さない
    return (
      <button type="button" onClick={() => void query.refetch()} style={{ ...buttonStyle, color: 'var(--red-text)', fontSize: 11.5, fontFamily: 'inherit' }} title={t('Retry')}>
        {t('Could not load apps')}
      </button>
    )
  }

  const entries = (query.data ?? []).flatMap((app) => app.entryPoints.map((entry) => ({ app, entry })))
  if (entries.length === 0) return null

  const toggleMenu = () => {
    if (menuPosition) return closeMenu()
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    // 入力欄は画面の下にあるので、メニューはボタンの上に開く（bottom 指定は fixed の基準が画面と一致しない祖先があるとずれるため top で置く）
    const menuHeight = entries.length * MENU_ITEM_HEIGHT + 10
    setMenuPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8)), top: Math.max(8, rect.top - menuHeight - 4) })
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={menuPosition !== null}
        aria-label={t('Apps')}
        title={t('Apps')}
        onClick={toggleMenu}
        style={{ ...buttonStyle, ...(menuPosition ? { background: 'var(--card-hover)' } : {}) }}
      >
        <Icon name="grid" size={compact || iconOnly ? 15 : 13} />
        {!compact && !iconOnly && t('Apps')}
      </button>
      {menuPosition && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={t('Apps')}
          style={{ position: 'fixed', left: menuPosition.left, top: menuPosition.top, width: MENU_WIDTH, padding: 4, background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: 8, boxShadow: 'var(--shadow-pop)', zIndex: 'var(--z-popover)' }}
        >
          {entries.map(({ app, entry }, index) => {
            const appName = displayAppName({ name: app.appName, firstParty: app.firstParty }, t)
            return (
              <button
                key={`${app.installationId}:${entry.command}`}
                type="button"
                role="menuitem"
                autoFocus={index === 0}
                onClick={() => {
                  closeMenu()
                  if (app.inChannel) void invoke({ app, command: entry.command })
                  else setConfirming({ app, command: entry.command })
                }}
                style={{ width: '100%', height: MENU_ITEM_HEIGHT, display: 'flex', alignItems: 'center', gap: 8, border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', padding: '0 9px', fontFamily: 'inherit', fontSize: 12.5, textAlign: 'left', whiteSpace: 'nowrap' }}
                className="hover-bg"
              >
                <Icon name="list" size={14} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(entry.label)}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--text-4)', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{appName}</span>
              </button>
            )
          })}
        </div>,
        buttonRef.current?.closest('.app') ?? buttonRef.current?.closest('.app-root') ?? document.body,
      )}
      {confirming && (
        <Modal onClose={() => setConfirming(null)} label={t('Add {app} to this channel?', { app: displayAppName({ name: confirming.app.appName, firstParty: confirming.app.firstParty }, t) })} role="alertdialog">
          <div className="card" style={{ position: 'relative', width: 380, maxWidth: '90vw', padding: 20, boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>{t('Add {app} to this channel?', { app: displayAppName({ name: confirming.app.appName, firstParty: confirming.app.firstParty }, t) })}</h2>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 16 }}>{t('The app will be able to post to this channel.')}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn" onClick={() => setConfirming(null)}>{t('Cancel')}</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const entry = confirming
                  setConfirming(null)
                  void invoke(entry)
                }}
              >
                {t('Add')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
