// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import type { PageId } from '@/components/app/sidebar'

/**
 * グローバルなキーボードショートカット。哲学は docs/keyboard-shortcuts.md を参照。
 *
 *  - アプリ層（数字ナビ・Web）: Mac=⌘⌥+数字 / Win・Linux=Ctrl⇧+数字
 *    （⌘+数字 はタブ切替に取られる。Mac は ⌘⇧3/4 がスクショ予約のため ⌘⌥ を使う）
 *  - グローバル操作: ⌘K パレット / ⌘⇧F 横断検索 / ? ヘルプ（英字は ⌘⇧ で Mac/Win 共通）
 *  - アプリ層（数字ナビ・通知・設定）: Mac=⌘⌥+数字/U/, / Win・Linux=Ctrl⇧+数字/U/,
 *  - コンテキスト層（⌥/Alt）: ⌥M/W カレンダー表示、⌥←→ 期間送り（時間=水平）、
 *    ⌥↑↓ 順送り（リスト=垂直）、⌥N 新規作成
 *  - Desktop（Electron）: ネイティブメニュー ⌘+数字、および Ctrl+Tab/Ctrl+Shift+Tab を
 *    preload 経由で受ける
 *
 * 入力欄（input/textarea/select/contentEditable）では ⌥ 系・? を無効化する。
 */

const NAV_BY_DIGIT: Record<string, PageId> = {
  Digit1: 'projects',
  Digit2: 'calendar',
  Digit3: 'kanban',
  Digit4: 'tasks',
  Digit5: 'chats',
  Digit6: 'files',
  Digit7: 'gallery',
  Digit8: 'ai',
  Digit9: 'members',
}

type CalView = 'month' | 'week' | 'timeline'

// timeline は PC に描画ビューが無いため、現状ショートカットは月/週のみ割り当てる
const CAL_VIEW_BY_CODE: Record<string, CalView> = {
  KeyM: 'month',
  KeyW: 'week',
}

// ⌥←→（期間）と ⌥↑↓（順送り）・⌥N（作成）は、対応する画面でのみ既定動作を奪う
const SEQ_PAGES = new Set<PageId>(['chats', 'ai'])
const CREATE_PAGES = new Set<PageId>(['projects', 'calendar', 'kanban', 'tasks', 'chats', 'ai'])
// ⌥F はフィルタ popover を持つ画面のみ（tasks/files/members はタブ式で popover を持たない）
const FILTER_PAGES = new Set<PageId>(['projects', 'calendar', 'kanban'])
const SEARCH_FOCUS_PAGES = new Set<PageId>(['projects', 'files', 'members', 'chats'])
const VIEW_TOGGLE_PAGES = new Set<PageId>(['projects'])
const FILTER_TAB_PAGES = new Set<PageId>(['projects', 'tasks', 'files', 'members'])

declare global {
  interface Window {
    /** Electron preload が公開するブリッジ（Web 単体では undefined） */
    cairnDesktop?: {
      onNavigate?: (cb: (action: string) => void) => (() => void) | void
      /** Ctrl+Tab / Ctrl+Shift+Tab の順送り（Desktop 特権） */
      onSeq?: (cb: (dir: 'prev' | 'next') => void) => (() => void) | void
      /** ⌘B サイドバー折りたたみ（Desktop ネイティブメニュー） */
      onToggleSidebar?: (cb: () => void) => (() => void) | void
    }
    /** ⌘⇧F で chats へ遷移した直後、横断検索を開くための受け渡しフラグ */
    __cairnOpenCrossSearch?: boolean
  }
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac OS X/.test(navigator.userAgent)
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  // SELECT も含める: Alt+↑↓ はネイティブのドロップダウン操作なので奪わない
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export interface UseAppShortcutsArgs {
  navigate: (page: PageId) => void
  /** 現在の画面。⌥←→/↑↓/N の既定動作を奪う対象を絞るのに使う */
  page: PageId
  /** Esc 押下時に呼ばれる。何か閉じたら true を返すと preventDefault する */
  onEscape?: () => boolean
  /** ⌘K コマンドパレットを開く */
  onCommandPalette?: () => void
  /** ? ショートカット一覧を開く */
  onHelp?: () => void
  /** ⌘⌥U 通知を開く */
  onNotifications?: () => void
  /** ⌘⌥B サイドバーの折りたたみをトグル */
  onToggleSidebar?: () => void
}

export function useAppShortcuts({ navigate, page, onEscape, onCommandPalette, onHelp, onNotifications, onToggleSidebar }: UseAppShortcutsArgs) {
  // ハンドラは毎レンダー再生成されうるので ref で最新を参照（リスナーは1回だけ登録）
  const navRef = React.useRef(navigate)
  navRef.current = navigate
  const pageRef = React.useRef(page)
  pageRef.current = page
  const escRef = React.useRef(onEscape)
  escRef.current = onEscape
  const paletteRef = React.useRef(onCommandPalette)
  paletteRef.current = onCommandPalette
  const helpRef = React.useRef(onHelp)
  helpRef.current = onHelp
  const notifRef = React.useRef(onNotifications)
  notifRef.current = onNotifications
  const sidebarRef = React.useRef(onToggleSidebar)
  sidebarRef.current = onToggleSidebar

  React.useEffect(() => {
    const mac = isMac()

    // ⌥M/W: カレンダービュー切替。永続化 → カレンダーへ遷移 → マウント済みなら即反映
    const applyCalView = (view: CalView) => {
      localStorage.setItem(STORAGE_KEYS.calendar_view, view)
      navRef.current('calendar')
      window.dispatchEvent(new CustomEvent('cairn:cal-view', { detail: view }))
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const editable = isEditableTarget(e.target)

      // Esc=閉じる（全画面共通）。入力欄では各自の Esc 挙動を尊重して素通り
      if (e.key === 'Escape' && !editable) {
        if (escRef.current?.()) e.preventDefault()
        return
      }

      const primary = mac ? e.metaKey : e.ctrlKey // ⌘ / Ctrl

      // グローバル操作（⌘/Ctrl 系・英字は Mac/Win 共通）
      if (primary && !e.altKey) {
        // ⌘K: コマンドパレット
        if (!e.shiftKey && e.code === 'KeyK') {
          e.preventDefault()
          paletteRef.current?.()
          return
        }
        // ⌘⇧F: 横断検索（chats へ遷移して開く）
        if (e.shiftKey && e.code === 'KeyF') {
          e.preventDefault()
          window.__cairnOpenCrossSearch = true
          navRef.current('chats')
          window.dispatchEvent(new CustomEvent('cairn:cross-search'))
          return
        }
      }

      // アプリ層: 数字ナビ。Mac は ⌘⌥（⌘⇧3/4 がスクショ予約のため）、Win/Linux は Ctrl⇧
      const appMod = mac
        ? (e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey)
        : (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey)
      const navPage = NAV_BY_DIGIT[e.code]
      if (appMod && navPage) {
        e.preventDefault()
        navRef.current(navPage)
        return
      }
      // ⌘⌥+0: ユーザーメニュー（ステータス / ログアウト）をトグル
      if (appMod && e.code === 'Digit0') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('cairn:user-menu'))
        return
      }
      // ⌘⌥+, (Comma): 設定
      if (appMod && e.code === 'Comma') {
        e.preventDefault()
        navRef.current('settings')
        return
      }
      // ⌘⌥U: 通知
      if (appMod && e.code === 'KeyU') {
        e.preventDefault()
        notifRef.current?.()
        return
      }
      // ⌘⌥B: サイドバー折りたたみトグル（Desktop は ⌘B をネイティブメニューで処理）
      if (appMod && e.code === 'KeyB') {
        e.preventDefault()
        sidebarRef.current?.()
        return
      }
      // ⌘⌥; : ワークスペース切替ポップオーバーをトグル（記号は US/JIS で同位置の Semicolon）
      if (appMod && e.code === 'Semicolon') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('cairn:workspace-menu'))
        return
      }

      // ? : ヘルプ（修飾なし・入力欄以外）
      if (e.key === '?' && !primary && !e.altKey && !editable) {
        e.preventDefault()
        helpRef.current?.()
        return
      }

      // コンテキスト層: ⌥/Alt 単独。入力欄では無効化
      const ctxMod = e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey
      if (!ctxMod || editable) return

      const calView = CAL_VIEW_BY_CODE[e.code]
      if (calView) {
        e.preventDefault()
        applyCalView(calView)
        return
      }
      // 時間軸は水平: ⌥←/→ でカレンダーの前/次の期間。
      // カレンダー以外では受け手がいないので、ブラウザの戻る/進む（Alt+←→）を奪わない
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        if (pageRef.current !== 'calendar') return
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('cairn:period', { detail: e.code === 'ArrowLeft' ? 'prev' : 'next' }))
        return
      }
      // リストは垂直: ⌥↑/↓ で順送り（チャンネル・会話）。対象画面のみ
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        if (!SEQ_PAGES.has(pageRef.current)) return
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('cairn:seq', { detail: e.code === 'ArrowUp' ? 'prev' : 'next' }))
        return
      }
      // ⌥N: 新規作成（今アクティブな画面が cairn:create を解釈する）。
      // 長押しのオートリピートで多重発火しないよう e.repeat を弾く
      if (e.code === 'KeyN') {
        if (e.repeat || !CREATE_PAGES.has(pageRef.current)) return
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('cairn:create'))
        return
      }
      // ⌥F: フィルタ popover をトグル
      if (e.code === 'KeyF') {
        if (!FILTER_PAGES.has(pageRef.current)) return
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('cairn:filter'))
        return
      }
      // ⌥S: 検索入力にフォーカス
      if (e.code === 'KeyS') {
        if (!SEARCH_FOCUS_PAGES.has(pageRef.current)) return
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('cairn:search-focus'))
        return
      }
      // ⌥G: グリッド表示（Projects のみ）
      if (e.code === 'KeyG') {
        if (!VIEW_TOGGLE_PAGES.has(pageRef.current)) return
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('cairn:view', { detail: 'grid' }))
        return
      }
      // ⌥T: テーブル表示（Projects）/ 今日へジャンプ（Calendar）
      if (e.code === 'KeyT') {
        if (pageRef.current === 'projects') {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('cairn:view', { detail: 'table' }))
        } else if (pageRef.current === 'calendar') {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('cairn:today'))
        }
        return
      }
      // ⌥D: 詳細パネルをトグル（Chats のみ）
      if (e.code === 'KeyD') {
        if (pageRef.current !== 'chats') return
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('cairn:detail'))
        return
      }
      // ⌥[ / ⌥]: フィルタタブを前/次へ切替
      // JIS: @(BracketLeft)=前, [(BracketRight)=次, ](Backslash)=次
      // US: [(BracketLeft)=前, ](BracketRight)=次
      if (e.code === 'BracketLeft' || e.code === 'BracketRight' || e.code === 'Backslash' || e.code === 'IntlYen') {
        if (!FILTER_TAB_PAGES.has(pageRef.current)) return
        e.preventDefault()
        const isPrev = e.code === 'BracketLeft'
        window.dispatchEvent(new CustomEvent('cairn:filter-tab', { detail: isPrev ? 'prev' : 'next' }))
        return
      }
      // ⌥Enter: タスクの完了/未完了をトグル（Tasks のみ）。
      // 長押しのオートリピートで複数タスクを誤トグルしないよう e.repeat を弾く
      if (e.code === 'Enter') {
        if (pageRef.current !== 'tasks' || e.repeat) return
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('cairn:toggle-task'))
        return
      }
      // ⌥Delete: ファイル削除（Files のみ）
      if (e.code === 'Backspace' || e.code === 'Delete') {
        if (pageRef.current !== 'files') return
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('cairn:delete-selected'))
        return
      }
      // ⌥R: ファイル再インデックス（Files のみ）
      if (e.code === 'KeyR') {
        if (pageRef.current !== 'files') return
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('cairn:reindex-selected'))
      }
      // 注: ⌥M は CAL_VIEW_BY_CODE（月表示）で先に消費されるため、
      // 通知の全既読には割り当てない（重複・到達不能を避ける）
    }

    window.addEventListener('keydown', onKeyDown)
    // Desktop（Electron）の preload ブリッジ
    const offNavigate = window.cairnDesktop?.onNavigate?.((action) => navRef.current(action as PageId))
    const offSeq = window.cairnDesktop?.onSeq?.((dir) => {
      window.dispatchEvent(new CustomEvent('cairn:seq', { detail: dir }))
    })
    const offToggleSidebar = window.cairnDesktop?.onToggleSidebar?.(() => sidebarRef.current?.())

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      offNavigate?.()
      offSeq?.()
      offToggleSidebar?.()
    }
  }, [])
}
