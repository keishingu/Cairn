// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { PageId } from '@/components/app/sidebar'

/**
 * コマンドカタログ（単一の真実）。
 *
 * キー処理・コマンドパレット・ヘルプ・ヒント表示はすべてこの配列から派生する。
 * 各コマンドの「実体（ハンドラ）」は実行時に useCommand(id, handler) で登録され、
 * ディスパッチャは keydown → コマンド id → when 判定 → 登録ハンドラ呼び出し、を行う。
 * ハンドラ未登録のコマンドは no-op（dev で警告）になり、死にショートカットが構造的に消える。
 *
 * 哲学（3層）は docs/keyboard-shortcuts.md を参照。
 *  - app:     Mac=⌘⌥ / Win・Linux=Ctrl⇧（数字ナビ・通知・設定 等）
 *  - global:  Mac=⌘ / Win・Linux=Ctrl（+Shift）。コマンドパレット・横断検索・ヘルプ
 *  - context: ⌥ / Alt。今いる画面の操作（when でページを限定）
 */

export type CommandLayer = 'app' | 'global' | 'context'

export interface KeyBinding {
  /** KeyboardEvent.code（複数可。例: フィルタタブ次へは ] と JIS の \\ ¥） */
  code: string | string[]
  /** global 層で Shift を要求するか（例: ⌘⇧F） */
  shift?: boolean
  /** layer の代わりに素のキー（修飾なし）で `?` 等を拾う場合に使う e.key */
  plainKey?: string
}

export interface CommandDef {
  id: string
  /** パレット・ヘルプでの表示名 */
  title: string
  layer: CommandLayer
  key?: KeyBinding
  /** ヒント/ヘルプ/パレットで表示するキーキャップ（例: ['1'] / ['←','→'] / ['⌫']） */
  hintKeys?: string[]
  /** 有効なページを限定（未指定なら全ページ） */
  when?: (page: PageId) => boolean
  /** オートリピート（長押し）を無視する（作成・トグル等の破壊的/多重発火防止） */
  noRepeat?: boolean
  /** コマンドパレットに出すか（既定 false） */
  inPalette?: boolean
}

// ── ページ集合 ────────────────────────────────────────────────────
export const CREATE_PAGES = new Set<PageId>(['projects', 'calendar', 'kanban', 'tasks', 'chats', 'ai'])
export const FILTER_PAGES = new Set<PageId>(['projects', 'calendar', 'kanban'])
export const SEARCH_FOCUS_PAGES = new Set<PageId>(['projects', 'files', 'members', 'chats'])
export const FILTER_TAB_PAGES = new Set<PageId>(['projects', 'tasks', 'files', 'members'])
export const SEQ_PAGES = new Set<PageId>(['chats', 'ai'])

const is = (...pages: PageId[]) => (p: PageId) => pages.includes(p)

// ── カタログ ──────────────────────────────────────────────────────
export const COMMANDS: CommandDef[] = [
  // ── ナビゲーション（app 層・数字） ──
  { id: 'nav.chats',    title: 'Chats',         layer: 'app', key: { code: 'Digit1' }, hintKeys: ['1'], inPalette: true },
  { id: 'nav.projects', title: 'Project list', layer: 'app', key: { code: 'Digit2' }, hintKeys: ['2'], inPalette: true },
  { id: 'nav.calendar', title: 'Calendar',       layer: 'app', key: { code: 'Digit3' }, hintKeys: ['3'], inPalette: true },
  { id: 'nav.kanban',   title: 'Kanban',         layer: 'app', key: { code: 'Digit4' }, hintKeys: ['4'], inPalette: true },
  { id: 'nav.tasks',    title: 'My tasks',       layer: 'app', key: { code: 'Digit5' }, hintKeys: ['5'], inPalette: true },
  { id: 'nav.files',    title: 'Files',         layer: 'app', key: { code: 'Digit6' }, hintKeys: ['6'], inPalette: true },
  { id: 'nav.gallery',  title: 'Gallery',       layer: 'app', key: { code: 'Digit7' }, hintKeys: ['7'], inPalette: true },
  { id: 'nav.ai',       title: 'AI assistant',   layer: 'app', key: { code: 'Digit8' }, hintKeys: ['8'], inPalette: true },
  { id: 'nav.members',  title: 'Members',         layer: 'app', key: { code: 'Digit9' }, hintKeys: ['9'], inPalette: true },
  { id: 'nav.settings', title: 'Settings',             layer: 'app', key: { code: 'Comma' }, hintKeys: [','], inPalette: true },

  // ── アプリ全体（app 層・英字/記号） ──
  { id: 'app.userMenu',      title: 'User menu',     layer: 'app', key: { code: 'Digit0' },    hintKeys: ['0'], inPalette: true },
  { id: 'app.notifications', title: 'Open notifications',           layer: 'app', key: { code: 'KeyU' },      hintKeys: ['U'], inPalette: true },
  { id: 'app.toggleSidebar', title: 'Collapse sidebar', layer: 'app', key: { code: 'KeyB' },      hintKeys: ['B'], inPalette: true },
  { id: 'app.workspaceMenu', title: 'Switch workspace',   layer: 'app', key: { code: 'Semicolon' }, hintKeys: [';'], inPalette: true },

  // ── グローバル操作（global 層） ──
  { id: 'global.commandPalette', title: 'Command palette', layer: 'global', key: { code: 'KeyK' },              hintKeys: ['K'] },
  { id: 'global.crossSearch',    title: 'Search across Cairn',         layer: 'global', key: { code: 'KeyF', shift: true }, hintKeys: ['F'], inPalette: true },
  { id: 'global.help',           title: 'Keyboard shortcuts', layer: 'global', key: { plainKey: '?', code: [] }, hintKeys: ['?'], inPalette: true },

  // ── コンテキスト（⌥/Alt・when でページ限定） ──
  { id: 'ctx.create',        title: 'Create new',     layer: 'context', key: { code: 'KeyN' }, hintKeys: ['N'], when: p => CREATE_PAGES.has(p), noRepeat: true, inPalette: true },
  { id: 'ctx.filter',        title: 'Filter',   layer: 'context', key: { code: 'KeyF' }, hintKeys: ['F'], when: p => FILTER_PAGES.has(p) },
  { id: 'ctx.searchFocus',   title: 'Focus search', layer: 'context', key: { code: 'KeyS' }, hintKeys: ['S'], when: p => SEARCH_FOCUS_PAGES.has(p) },
  { id: 'ctx.filterTabPrev', title: 'Previous filter tab', layer: 'context', key: { code: 'BracketLeft' },                            hintKeys: ['['], when: p => FILTER_TAB_PAGES.has(p) },
  { id: 'ctx.filterTabNext', title: 'Next filter tab', layer: 'context', key: { code: ['BracketRight', 'Backslash', 'IntlYen'] }, hintKeys: [']'], when: p => FILTER_TAB_PAGES.has(p) },

  // 順送り（チャンネル / 会話）
  { id: 'seq.prev', title: 'Previous (channel or conversation)', layer: 'context', key: { code: 'ArrowUp' },   hintKeys: ['↑'], when: p => SEQ_PAGES.has(p) },
  { id: 'seq.next', title: 'Next (channel or conversation)', layer: 'context', key: { code: 'ArrowDown' }, hintKeys: ['↓'], when: p => SEQ_PAGES.has(p) },

  // Projects 固有
  { id: 'projects.viewGrid',  title: 'Grid view', layer: 'context', key: { code: 'KeyG' }, hintKeys: ['G'], when: is('projects') },
  { id: 'projects.viewTable', title: 'Table view', layer: 'context', key: { code: 'KeyT' }, hintKeys: ['T'], when: is('projects') },

  // Calendar 固有
  { id: 'calendar.month',      title: 'Calendar: month', layer: 'context', key: { code: 'KeyM' },       hintKeys: ['M'],      when: is('calendar') },
  { id: 'calendar.week',       title: 'Calendar: week', layer: 'context', key: { code: 'KeyW' },       hintKeys: ['W'],      when: is('calendar') },
  { id: 'calendar.today',      title: 'Calendar: today', layer: 'context', key: { code: 'KeyT' },       hintKeys: ['T'],      when: is('calendar') },
  { id: 'calendar.prevPeriod', title: 'Calendar: previous period', layer: 'context', key: { code: 'ArrowLeft' },  hintKeys: ['←'],      when: is('calendar') },
  { id: 'calendar.nextPeriod', title: 'Calendar: next period', layer: 'context', key: { code: 'ArrowRight' }, hintKeys: ['→'],      when: is('calendar') },

  // Chats 固有
  { id: 'chats.detail', title: 'Toggle the detail panel', layer: 'context', key: { code: 'KeyD' }, hintKeys: ['D'], when: is('chats') },
  { id: 'chats.focusComposer', title: 'Focus the message field', layer: 'context', key: { code: 'KeyI' }, hintKeys: ['I'], when: is('chats') },

  // Tasks 固有
  { id: 'tasks.toggle', title: 'Toggle task complete', layer: 'context', key: { code: 'Enter' }, hintKeys: ['⏎'], when: is('tasks'), noRepeat: true },

  // Files 固有
  { id: 'files.delete',  title: 'Delete file',     layer: 'context', key: { code: ['Backspace', 'Delete'] }, hintKeys: ['⌫'], when: is('files'), noRepeat: true },
  { id: 'files.reindex', title: 'Reindex file', layer: 'context', key: { code: 'KeyR' },               hintKeys: ['R'], when: is('files') },
]

export const COMMAND_BY_ID: Record<string, CommandDef> = Object.fromEntries(COMMANDS.map(c => [c.id, c]))
