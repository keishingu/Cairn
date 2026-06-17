// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { Modal } from './primitives'

/** ? で開くショートカット一覧。哲学は docs/keyboard-shortcuts.md。 */

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac OS X/.test(navigator.userAgent)
}

type Row = { keys: string; label: string }
type Section = { title: string; rows: Row[] }

function buildSections(): Section[] {
  const mac = isMac()
  const isDesktop = typeof window !== 'undefined' && !!window.cairnDesktop
  const nav = isDesktop ? (mac ? '⌘' : 'Ctrl') : (mac ? '⌘⌥' : 'Ctrl ⇧')
  const g = mac ? '⌘' : 'Ctrl'
  const opt = mac ? '⌥' : 'Alt'

  const sections: Section[] = [
    {
      title: 'ナビゲーション',
      rows: [
        { keys: `${nav} 1`, label: 'プロジェクト一覧' },
        { keys: `${nav} 2`, label: 'カレンダー' },
        { keys: `${nav} 3`, label: 'カンバン' },
        { keys: `${nav} 4`, label: 'マイタスク' },
        { keys: `${nav} 5`, label: 'チャット一覧' },
        { keys: `${nav} 6`, label: 'ファイル' },
        { keys: `${nav} 7`, label: 'ギャラリー' },
        { keys: `${nav} 8`, label: 'AIアシスタント' },
        { keys: `${nav} 9`, label: 'メンバー' },
        { keys: `${nav} 0`, label: 'プロフィール' },
        { keys: `${nav} ,`, label: '設定' },
      ],
    },
    {
      title: 'グローバル',
      rows: [
        { keys: `${g} K`, label: 'コマンドパレット' },
        { keys: `${g} ⇧ F`, label: '横断検索（チャット）' },
        { keys: `${g} ⇧ U`, label: '通知を開く' },
        { keys: '?', label: 'このショートカット一覧' },
        { keys: 'Esc', label: '最前面のパネル/モーダルを閉じる' },
      ],
    },
    {
      title: '今の画面',
      rows: [
        { keys: `${opt} N`, label: '新規作成' },
        { keys: `${opt} F`, label: 'フィルター切替' },
        { keys: `${opt} S`, label: '検索にフォーカス' },
        { keys: `${opt} @ / ${opt} [`, label: 'フィルタタブ 前 / 次' },
        { keys: `${opt} M / ${opt} W`, label: 'カレンダー 月 / 週' },
        { keys: `${opt} A`, label: 'カレンダー タイムライン' },
        { keys: `${opt} T`, label: 'カレンダー 今日 / テーブル表示' },
        { keys: `${opt} G`, label: 'グリッド表示' },
        { keys: `${opt} D`, label: '詳細パネル切替' },
        { keys: `${opt} ← / ${opt} →`, label: 'カレンダー 前 / 次の期間' },
        { keys: `${opt} ↑ / ${opt} ↓`, label: '前 / 次（チャンネル・会話）' },
        { keys: `${opt} ⏎`, label: 'タスク完了トグル' },
        { keys: `${opt} ⌫`, label: 'ファイル削除' },
        { keys: `${opt} R`, label: 'ファイル再インデックス' },
      ],
    },
  ]

  if (isDesktop) {
    sections.push({
      title: 'デスクトップ特権',
      rows: [
        { keys: 'Ctrl Tab / Ctrl ⇧ Tab', label: '次 / 前（チャンネル・会話）' },
      ],
    })
  }
  return sections
}

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const sections = React.useMemo(buildSections, [])
  return (
    <Modal onClose={onClose}>
      <div className="card" style={{ position: 'relative', width: 560, maxWidth: '92vw', maxHeight: '80vh', overflowY: 'auto', padding: 22, boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>キーボードショートカット</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {sections.map(s => (
            <div key={s.title}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '.04em', marginBottom: 8 }}>{s.title}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {s.rows.map(r => (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{r.label}</span>
                    <kbd style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, padding: '3px 7px', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', whiteSpace: 'nowrap' }}>{r.keys}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
