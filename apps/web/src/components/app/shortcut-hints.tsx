// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import type { PageId } from '@/components/app/sidebar'

/**
 * which-key / vimium 風のショートカットヒント。
 * ⌘（Mac）/ Ctrl（Win）または ⌥（Option/Alt）を押し続けると、次に押せるキーと
 * その操作を一覧表示する。修飾キーを離す・実キーを押す・フォーカスが外れると消える。
 *
 * 表示専用（preventDefault しない）。実際の実行は use-app-shortcuts.ts が担う。
 */

type Layer = 'app' | 'context'
type Hint = { keys: string[]; label: string }

const APP_HINTS: Hint[] = [
  { keys: ['1'], label: 'プロジェクト一覧' },
  { keys: ['2'], label: 'カレンダー' },
  { keys: ['3'], label: 'カンバン' },
  { keys: ['4'], label: 'マイタスク' },
  { keys: ['5'], label: 'チャット一覧' },
  { keys: ['6'], label: 'ファイル' },
  { keys: ['7'], label: 'ギャラリー' },
  { keys: ['8'], label: 'AIアシスタント' },
  { keys: ['9'], label: 'メンバー' },
  { keys: ['0'], label: 'プロフィール' },
  { keys: [','], label: '設定' },
  { keys: ['U'], label: '通知を開く' },
]

const CREATE_PAGES = new Set<PageId>(['projects', 'calendar', 'kanban', 'tasks', 'chats', 'ai'])

function contextHints(page: PageId): Hint[] {
  const items: Hint[] = []
  if (page === 'projects') {
    items.push(
      { keys: ['F'], label: 'フィルター' },
      { keys: ['S'], label: '検索' },
      { keys: ['G'], label: 'グリッド表示' },
      { keys: ['T'], label: 'テーブル表示' },
      { keys: ['@', '['], label: 'フィルタタブ切替' },
    )
  }
  if (page === 'calendar') {
    items.push(
      { keys: ['M'], label: '月表示' },
      { keys: ['W'], label: '週表示' },
      { keys: ['A'], label: 'タイムライン' },
      { keys: ['T'], label: '今日へ' },
      { keys: ['←', '→'], label: '前 / 次の期間' },
      { keys: ['F'], label: 'フィルター' },
    )
  }
  if (page === 'kanban') {
    items.push({ keys: ['F'], label: 'フィルター' })
  }
  if (page === 'tasks') {
    items.push(
      { keys: ['@', '['], label: 'フィルタタブ切替' },
      { keys: ['⏎'], label: 'タスク完了トグル' },
    )
  }
  if (page === 'chats') {
    items.push(
      { keys: ['↑', '↓'], label: '前 / 次のチャンネル' },
      { keys: ['S'], label: '検索' },
      { keys: ['D'], label: '詳細パネル' },
    )
  }
  if (page === 'files') {
    items.push(
      { keys: ['@', '['], label: 'フィルタタブ切替' },
      { keys: ['⌫'], label: 'ファイル削除' },
      { keys: ['R'], label: '再インデックス' },
    )
  }
  if (page === 'members') {
    items.push(
      { keys: ['S'], label: '検索' },
      { keys: ['@', '['], label: 'ロールフィルタ切替' },
    )
  }
  if (page === 'ai') items.push({ keys: ['↑', '↓'], label: '前 / 次の会話' })
  if (CREATE_PAGES.has(page)) items.push({ keys: ['N'], label: '新規作成' })
  return items
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac OS X/.test(navigator.userAgent)
}

function isEditable(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

const SHOW_DELAY_MS = 350

export function ShortcutHints({ page }: { page: PageId }) {
  const [layer, setLayer] = React.useState<Layer | null>(null)
  const pageRef = React.useRef(page)
  pageRef.current = page

  React.useEffect(() => {
    const mac = isMac()
    const isDesktop = typeof window !== 'undefined' && !!window.cairnDesktop
    let timer: ReturnType<typeof setTimeout> | null = null
    let shown: Layer | null = null

    const hide = () => {
      if (timer) { clearTimeout(timer); timer = null }
      if (shown !== null) { shown = null; setLayer(null) }
    }

    const desiredLayer = (e: KeyboardEvent): Layer | null => {
      // context: 素の ⌥/Alt
      if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) return 'context'
      // app: Desktop=素の ⌘/Ctrl（ネイティブメニュー） / Web=Mac ⌘⌥・Win Ctrl⇧
      const appHeld = mac
        ? (isDesktop ? (e.metaKey && !e.ctrlKey && !e.shiftKey) : (e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey))
        : (isDesktop ? (e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) : (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey))
      if (appHeld) return 'app'
      return null
    }

    const onKey = (e: KeyboardEvent) => {
      // 実キー（修飾キー以外）の押下はショートカット発火 or 入力中。即座に隠す
      const isModKey = e.key === 'Meta' || e.key === 'Alt' || e.key === 'Control' || e.key === 'Shift'
      if (e.type === 'keydown' && !isModKey) { hide(); return }

      const next = desiredLayer(e)
      // context は入力欄では出さない（特殊文字入力・単語移動の邪魔をしない）
      if (!next || (next === 'context' && isEditable(document.activeElement))) { hide(); return }
      // context レイヤーで現在画面に出すものが無ければ表示しない
      if (next === 'context' && contextHints(pageRef.current).length === 0) { hide(); return }

      if (shown === next || timer) return
      timer = setTimeout(() => { timer = null; shown = next; setLayer(next) }, SHOW_DELAY_MS)
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', hide)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', hide)
      if (timer) clearTimeout(timer)
    }
  }, [])

  if (!layer) return null

  const mac = isMac()
  const isDesktop = typeof window !== 'undefined' && !!window.cairnDesktop
  const hints = layer === 'app' ? APP_HINTS : contextHints(page)
  if (hints.length === 0) return null

  const prefix = layer === 'app'
    ? (isDesktop ? (mac ? '⌘' : 'Ctrl') : (mac ? '⌘⌥' : 'Ctrl ⇧'))
    : (mac ? '⌥' : 'Alt')
  const title = layer === 'app' ? '移動' : '今の画面'

  return (
    <div
      role="dialog"
      aria-label="キーボードショートカット"
      style={{
        position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        zIndex: 9999, pointerEvents: 'none',
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,.18)', padding: '12px 16px',
        display: 'flex', flexDirection: 'column', gap: 8, minWidth: 240, maxWidth: '90vw',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '.04em' }}>
        {prefix} ・ {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {hints.map((h, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'flex', gap: 4 }}>
              {h.keys.map(k => (
                <kbd
                  key={k}
                  style={{
                    fontFamily: 'inherit', fontSize: 12, fontWeight: 600, lineHeight: 1,
                    minWidth: 22, textAlign: 'center', padding: '4px 6px',
                    background: 'var(--card-2)', border: '1px solid var(--border)',
                    borderRadius: 6, color: 'var(--text)',
                  }}
                >
                  {k}
                </kbd>
              ))}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{h.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
