// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { Modal } from './primitives'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import type { PageId } from './sidebar'

/**
 * ⌘K コマンドパレット（第2段）。
 * 現状はナビゲーション＋主要アクションの静的リスト。プロジェクト/チャンネル/人の
 * ライブ検索は将来の拡張（cmdk 等の導入時に別途）。
 */

interface Action {
  id: string
  label: string
  keys?: string[]
  run: () => void
}

export function CommandPalette({
  onClose, navigate, onNotifications,
}: {
  onClose: () => void
  navigate: (page: PageId) => void
  onNotifications: () => void
}) {
  const [query, setQuery] = React.useState('')
  const [index, setIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const actions = React.useMemo<Action[]>(() => {
    const go = (p: PageId) => () => { navigate(p); onClose() }
    const calView = (v: 'month' | 'week') => () => {
      localStorage.setItem(STORAGE_KEYS.calendar_view, v)
      navigate('calendar')
      window.dispatchEvent(new CustomEvent('cairn:cal-view', { detail: v }))
      onClose()
    }
    return [
      { id: 'go-projects', label: 'プロジェクト一覧', run: go('projects') },
      { id: 'go-calendar', label: 'カレンダー', run: go('calendar') },
      { id: 'go-kanban', label: 'カンバン', run: go('kanban') },
      { id: 'go-tasks', label: 'マイタスク', run: go('tasks') },
      { id: 'go-chats', label: 'チャット', run: go('chats') },
      { id: 'go-ai', label: 'AIアシスタント', run: go('ai') },
      { id: 'go-files', label: 'ファイル', run: go('files') },
      { id: 'go-gallery', label: 'ギャラリー', run: go('gallery') },
      { id: 'go-members', label: 'メンバー', run: go('members') },
      { id: 'go-settings', label: '設定', run: go('settings') },
      { id: 'create', label: '新規作成', keys: ['⌥', 'N'], run: () => { window.dispatchEvent(new CustomEvent('cairn:create')); onClose() } },
      { id: 'cross-search', label: '横断検索（チャット）', run: () => { window.__cairnOpenCrossSearch = true; navigate('chats'); window.dispatchEvent(new CustomEvent('cairn:cross-search')); onClose() } },
      { id: 'notifications', label: '通知を開く', run: () => { onNotifications(); onClose() } },
      { id: 'cal-month', label: 'カレンダー: 月表示', run: calView('month') },
      { id: 'cal-week', label: 'カレンダー: 週表示', run: calView('week') },
    ]
  }, [navigate, onNotifications, onClose])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    return actions.filter(a => a.label.toLowerCase().includes(q))
  }, [query, actions])

  React.useEffect(() => { setIndex(0) }, [query])
  React.useEffect(() => { inputRef.current?.focus() }, [])

  const run = (a: Action | undefined) => { if (a) a.run() }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(filtered[index]) }
  }

  return (
    <Modal onClose={onClose}>
      <div
        className="card"
        style={{ position: 'relative', width: 520, maxWidth: '92vw', maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="コマンドを検索…"
          style={{ border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', padding: '14px 16px', fontSize: 15, color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }}
        />
        <div style={{ overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '16px', fontSize: 13, color: 'var(--text-4)', textAlign: 'center' }}>該当なし</div>
          )}
          {filtered.map((a, i) => (
            <button
              key={a.id}
              onClick={() => run(a)}
              onMouseEnter={() => setIndex(i)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                width: '100%', textAlign: 'left', padding: '9px 10px', border: 'none', borderRadius: 8,
                background: i === index ? 'var(--card-2)' : 'transparent', cursor: 'pointer',
                fontSize: 13.5, color: 'var(--text)', fontFamily: 'inherit',
              }}
            >
              <span>{a.label}</span>
              {a.keys && (
                <span style={{ display: 'flex', gap: 3 }}>
                  {a.keys.map(k => (
                    <kbd key={k} style={{ fontFamily: 'inherit', fontSize: 11, padding: '2px 5px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text-3)' }}>{k}</kbd>
                  ))}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
