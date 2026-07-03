// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { Modal } from './primitives'
import { COMMANDS } from '@/lib/commands'
import { isMac, formatCommandKeys } from '@/lib/command-keys'
import { useCommandRegistry } from '@/lib/command-registry'
import type { PageId } from './sidebar'

/**
 * ⌘K コマンドパレット。コマンドカタログ（COMMANDS）から「今のページで有効かつ
 * ハンドラ登録済み」のコマンドを並べる。表示も実行も単一の真実から派生する。
 */
export function CommandPalette({ onClose, page }: { onClose: () => void; page: PageId }) {
  const { invoke, has, version } = useCommandRegistry()
  const mac = isMac()
  const [query, setQuery] = React.useState('')
  const [index, setIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const commands = React.useMemo(
    () => COMMANDS.filter(c => c.inPalette && (c.when?.(page) ?? true) && has(c.id)),
    // version はハンドラ登録/解除のたびに再評価するために必要（has は安定参照）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, has, version],
  )

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(c => c.title.toLowerCase().includes(q))
  }, [query, commands])

  React.useEffect(() => { setIndex(0) }, [query])
  React.useEffect(() => { inputRef.current?.focus() }, [])

  const run = (id: string | undefined) => { if (id) { invoke(id); onClose() } }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(filtered[index]?.id) }
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
          {filtered.map((c, i) => (
            <button
              key={c.id}
              onClick={() => run(c.id)}
              onMouseEnter={() => setIndex(i)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                width: '100%', textAlign: 'left', padding: '9px 10px', border: 'none', borderRadius: 8,
                background: i === index ? 'var(--card-2)' : 'transparent', cursor: 'pointer',
                fontSize: 13.5, color: 'var(--text)', fontFamily: 'inherit',
              }}
            >
              <span>{c.title}</span>
              <kbd style={{ fontFamily: 'inherit', fontSize: 11, padding: '2px 6px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                {formatCommandKeys(c, mac)}
              </kbd>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
