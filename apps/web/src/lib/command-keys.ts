// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { PageId } from '@/components/app/sidebar'
import { COMMANDS, type CommandDef, type CommandLayer } from './commands'

export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac OS X/.test(navigator.userAgent)
}

export function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

function codeMatches(code: string, defCode: string | string[]): boolean {
  return Array.isArray(defCode) ? defCode.includes(code) : defCode === code
}

/** keydown イベントがコマンド定義のキーバインドに一致するか（OS 別の修飾を解決） */
export function matchesBinding(e: KeyboardEvent, def: CommandDef, mac: boolean): boolean {
  const key = def.key
  if (!key) return false
  // 素のキー（修飾なし）。`?` 等。Shift は文字生成のため許容する
  if (key.plainKey) {
    return e.key === key.plainKey && !e.metaKey && !e.ctrlKey && !e.altKey
  }
  if (!codeMatches(e.code, key.code)) return false
  switch (def.layer) {
    case 'app':
      return mac
        ? (e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey)
        : (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey)
    case 'global': {
      const primary = mac ? e.metaKey : e.ctrlKey
      const other = mac ? e.ctrlKey : e.metaKey
      return primary && !other && !e.altKey && (e.shiftKey === !!key.shift)
    }
    case 'context':
      return e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey
  }
}

/** context 層・素キー(`?`)は入力欄では無効にしたい（ページ移動系は常時有効） */
export function bindingNeedsEditableGuard(def: CommandDef): boolean {
  return def.layer === 'context' || !!def.key?.plainKey
}

/** keydown → 一致するコマンド定義（when でページ限定）を返す。複数候補は先頭優先 */
export function matchCommand(e: KeyboardEvent, page: PageId, mac: boolean): CommandDef | null {
  const editable = isEditableTarget(e.target)
  for (const def of COMMANDS) {
    if (!matchesBinding(e, def, mac)) continue
    if (editable && bindingNeedsEditableGuard(def)) continue
    if (def.when && !def.when(page)) continue
    return def
  }
  return null
}

// ── 表示用 ────────────────────────────────────────────────────────
export function layerPrefix(layer: CommandLayer, mac: boolean): string {
  switch (layer) {
    case 'app': return mac ? '⌘⌥' : 'Ctrl ⇧'
    case 'global': return mac ? '⌘' : 'Ctrl'
    case 'context': return mac ? '⌥' : 'Alt'
  }
}

/** ヘルプ/パレットでの完全なキー表示（例「⌘⌥ 1」「⌘ ⇧ F」「⌥ ←」「?」） */
export function formatCommandKeys(def: CommandDef, mac: boolean): string {
  if (def.key?.plainKey) return def.key.plainKey
  const prefix = layerPrefix(def.layer, mac)
  const shift = def.layer === 'global' && def.key?.shift ? '⇧ ' : ''
  const caps = (def.hintKeys ?? []).join(' / ')
  return `${prefix} ${shift}${caps}`.trim()
}
