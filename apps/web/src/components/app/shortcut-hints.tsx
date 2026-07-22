// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import type { PageId } from '@/components/app/sidebar'
import { COMMANDS } from '@/lib/commands'
import { isMac, isEditableTarget } from '@/lib/command-keys'

/**
 * which-key / vimium 風のショートカットヒント。⌘⌥（Mac）/ Ctrl⇧（Win）または ⌥/Alt を
 * 押し続けると、次に押せるキーと操作を一覧表示する。表示専用で、コマンドカタログから派生する。
 */

type Layer = 'app' | 'context'

function hintsForLayer(layer: Layer, page: PageId): { id: string; keys: string[]; label: string }[] {
  return COMMANDS
    .filter(c => c.layer === layer && c.hintKeys && (c.when?.(page) ?? true))
    .map(c => ({ id: c.id, keys: c.hintKeys ?? [], label: c.title }))
}

const SHOW_DELAY_MS = 350

export function ShortcutHints({ page }: { page: PageId }) {
  const [layer, setLayer] = React.useState<Layer | null>(null)
  const pageRef = React.useRef(page)
  pageRef.current = page

  React.useEffect(() => {
    const mac = isMac()
    let timer: ReturnType<typeof setTimeout> | null = null
    let shown: Layer | null = null

    const hide = () => {
      if (timer) { clearTimeout(timer); timer = null }
      if (shown !== null) { shown = null; setLayer(null) }
    }

    // アプリ層は全プラットフォームで ⌘⌥/Ctrl⇧（キーハンドラ）に統一して表示する。
    const desiredLayer = (e: KeyboardEvent): Layer | null => {
      if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) return 'context'
      const appHeld = mac
        ? (e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey)
        : (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey)
      return appHeld ? 'app' : null
    }

    const onKey = (e: KeyboardEvent) => {
      const isModKey = e.key === 'Meta' || e.key === 'Alt' || e.key === 'Control' || e.key === 'Shift'
      if (e.type === 'keydown' && !isModKey) { hide(); return }

      const next = desiredLayer(e)
      if (!next || (next === 'context' && isEditableTarget(document.activeElement))) { hide(); return }
      if (next === 'context' && hintsForLayer('context', pageRef.current).length === 0) { hide(); return }

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
  const hints = hintsForLayer(layer, page)
  if (hints.length === 0) return null

  const prefix = layer === 'app' ? (mac ? '⌘⌥' : 'Ctrl ⇧') : (mac ? '⌥' : 'Alt')
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
        {hints.map(h => (
          <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
