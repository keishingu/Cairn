// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import type { PageId } from '@/components/app/sidebar'
import { isMac, isEditableTarget, matchCommand } from '@/lib/command-keys'
import { useCommandRegistry } from '@/lib/command-registry'

declare global {
  interface Window {
    /** Electron preload が公開するブリッジ（Web 単体では undefined） */
    cairnDesktop?: {
      onNavigate?: (cb: (action: string) => void) => (() => void) | void
      onSeq?: (cb: (dir: 'prev' | 'next') => void) => (() => void) | void
      onToggleSidebar?: (cb: () => void) => (() => void) | void
      /** 未読バッジ数を Electron main へ通知（Windows タスクバーのオーバーレイ用） */
      setBadgeCount?: (count: number) => void
    }
  }
}

/**
 * グローバルなキーボードショートカットのディスパッチャ。
 * keydown → コマンドカタログと突き合わせ → 登録ハンドラを invoke する。
 * Esc は「何か閉じたら preventDefault」の特殊挙動のためコマンド化せず onEscape で扱う。
 */
export function useCommandDispatcher({ page, onEscape }: { page: PageId; onEscape?: () => boolean }) {
  const { invoke } = useCommandRegistry()
  const pageRef = React.useRef(page)
  pageRef.current = page
  const escRef = React.useRef(onEscape)
  escRef.current = onEscape

  React.useEffect(() => {
    const mac = isMac()

    const onKeyDown = (e: KeyboardEvent) => {
      // Esc=閉じる（全画面共通）。入力欄では各自の Esc 挙動を尊重して素通り
      if (e.key === 'Escape' && !isEditableTarget(e.target)) {
        if (escRef.current?.()) e.preventDefault()
        return
      }
      const def = matchCommand(e, pageRef.current, mac)
      if (!def) return
      if (def.noRepeat && e.repeat) return
      e.preventDefault()
      invoke(def.id)
    }

    window.addEventListener('keydown', onKeyDown)
    // Desktop（Electron）の preload ブリッジ → コマンド invoke
    const offNavigate = window.cairnDesktop?.onNavigate?.((action) => invoke(`nav.${action}`))
    const offSeq = window.cairnDesktop?.onSeq?.((dir) => invoke(`seq.${dir}`))
    const offToggleSidebar = window.cairnDesktop?.onToggleSidebar?.(() => invoke('app.toggleSidebar'))

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      offNavigate?.()
      offSeq?.()
      offToggleSidebar?.()
    }
  }, [invoke])
}
