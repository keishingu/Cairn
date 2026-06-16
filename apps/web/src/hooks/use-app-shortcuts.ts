// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import type { PageId } from '@/components/app/sidebar'

/**
 * グローバルなキーボードショートカット（第1段）。
 *
 * 哲学は docs/keyboard-shortcuts.md を参照。
 *  - アプリ層（数字ナビ・Web）: Mac=⌘⌥+数字 / Win・Linux=Ctrl⇧+数字
 *    （⌘+数字 はタブ切替に取られる。Mac は ⌘⇧3/4 がスクショ予約のため ⌘⌥ を使う）
 *  - コンテキスト層（⌥/Alt）: カレンダーの月/週/タイムライン切替・順送り
 *  - Desktop（Electron）はネイティブメニュー ⌘+数字 を preload 経由で受ける
 *
 * 入力欄（input / textarea / contentEditable）にフォーカスがある時、⌥ 系は
 * 特殊文字入力・単語移動を尊重して無効化する。数字ナビは画面移動なので常に有効。
 */

const NAV_BY_DIGIT: Record<string, PageId> = {
  Digit1: 'projects',
  Digit2: 'calendar',
  Digit3: 'kanban',
  Digit4: 'tasks',
}

type CalView = 'month' | 'week' | 'timeline'

const CAL_VIEW_BY_CODE: Record<string, CalView> = {
  KeyM: 'month',
  KeyW: 'week',
  KeyT: 'timeline',
}

declare global {
  interface Window {
    /** Electron preload が公開するブリッジ（Web 単体では undefined） */
    cairnDesktop?: {
      onNavigate?: (cb: (action: string) => void) => (() => void) | void
    }
  }
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac OS X/.test(navigator.userAgent)
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

export interface UseAppShortcutsArgs {
  navigate: (page: PageId) => void
  /** Esc 押下時に呼ばれる。何か閉じたら true を返すと preventDefault する */
  onEscape?: () => boolean
}

export function useAppShortcuts({ navigate, onEscape }: UseAppShortcutsArgs) {
  // navigate は毎レンダー再生成されうるので ref で最新を参照（リスナーは1回だけ登録）
  const navRef = React.useRef(navigate)
  navRef.current = navigate
  const escRef = React.useRef(onEscape)
  escRef.current = onEscape

  React.useEffect(() => {
    const mac = isMac()

    // ⌥M/W/T: カレンダービュー切替。永続化 → カレンダーへ遷移 → マウント済みなら即反映
    const applyCalView = (view: CalView) => {
      localStorage.setItem(STORAGE_KEYS.calendar_view, view)
      navRef.current('calendar')
      window.dispatchEvent(new CustomEvent('cairn:cal-view', { detail: view }))
    }

    const onKeyDown = (e: KeyboardEvent) => {
      // Esc=閉じる（全画面共通）。入力欄では各自の Esc 挙動を尊重して素通り
      if (e.key === 'Escape' && !isEditableTarget(e.target)) {
        if (escRef.current?.()) e.preventDefault()
        return
      }

      // アプリ層: 数字ナビ。Web では ⌘+数字 がタブ切替に取られるため修飾を足すが、
      // Mac の ⌘⇧3/⌘⇧4 はスクリーンショット予約と衝突するため Mac は ⌘⌥、Win/Linux は Ctrl⇧
      const appMod = mac
        ? (e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey)
        : (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey)
      const navPage = NAV_BY_DIGIT[e.code]
      if (appMod && navPage) {
        e.preventDefault()
        navRef.current(navPage)
        return
      }

      // コンテキスト層: ⌥/Alt 単独。入力欄では無効化
      const ctxMod = e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey
      if (!ctxMod || isEditableTarget(e.target)) return

      const calView = CAL_VIEW_BY_CODE[e.code]
      if (calView) {
        e.preventDefault()
        applyCalView(calView)
        return
      }
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        // 順送り（前/次）。今アクティブな画面が cairn:seq を解釈する
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('cairn:seq', { detail: e.code === 'ArrowUp' ? 'prev' : 'next' }))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    // Desktop（Electron）のネイティブメニュー ⌘+数字 経由のナビゲーション
    const offDesktop = window.cairnDesktop?.onNavigate?.((action) => {
      navRef.current(action as PageId)
    })

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      offDesktop?.()
    }
  }, [])
}
