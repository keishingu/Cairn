// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { Modal } from './primitives'
import { COMMANDS, type CommandLayer } from '@/lib/commands'
import { isMac, formatCommandKeys } from '@/lib/command-keys'

/** ? で開くショートカット一覧。コマンドカタログから生成する（手書きの二重管理を排除）。 */

const SECTION_TITLE: Record<CommandLayer, string> = {
  app: 'ナビ・アプリ',
  global: 'グローバル',
  context: '今の画面（⌥）',
}
const SECTION_ORDER: CommandLayer[] = ['app', 'global', 'context']

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const mac = isMac()
  const isDesktop = typeof window !== 'undefined' && !!window.cairnDesktop

  const sections = React.useMemo(
    () => SECTION_ORDER.map(layer => ({
      layer,
      title: SECTION_TITLE[layer],
      rows: COMMANDS.filter(c => c.layer === layer && c.key).map(c => ({ id: c.id, keys: formatCommandKeys(c, mac), label: c.title })),
    })).filter(s => s.rows.length > 0),
    [mac],
  )

  return (
    <Modal onClose={onClose}>
      <div className="card" style={{ position: 'relative', width: 600, maxWidth: '92vw', maxHeight: '80vh', overflowY: 'auto', padding: 22, boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>キーボードショートカット</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {sections.map(s => (
            <div key={s.layer}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '.04em', marginBottom: 8 }}>{s.title}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {s.rows.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{r.label}</span>
                    <kbd style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, padding: '3px 7px', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', whiteSpace: 'nowrap' }}>{r.keys}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {isDesktop && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '.04em', marginBottom: 8 }}>デスクトップ特権</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>次 / 前（チャンネル・会話）</span>
                <kbd style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, padding: '3px 7px', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', whiteSpace: 'nowrap' }}>Ctrl Tab / Ctrl ⇧ Tab</kbd>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
