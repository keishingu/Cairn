// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'

/**
 * 上下矢印キーでリスト項目を選択移動するためのフック。
 * 入力欄フォーカス時は無効化。
 *
 * @param itemCount - リストの項目数
 * @param onEnter - 選択中に Enter を押した時のコールバック（任意）
 * @returns selectedIndex（-1 は未選択）
 */
export function useArrowNav(itemCount: number, onEnter?: (index: number) => void) {
  const [selectedIndex, setSelectedIndex] = React.useState(-1)
  const onEnterRef = React.useRef(onEnter)
  onEnterRef.current = onEnter

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return

      if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return

      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        if (itemCount === 0) return
        e.preventDefault()
        setSelectedIndex(prev =>
          e.code === 'ArrowDown'
            ? Math.min(prev + 1, itemCount - 1)
            : Math.max(prev - 1, 0),
        )
        return
      }

      if (e.code === 'Enter' && selectedIndex >= 0) {
        e.preventDefault()
        onEnterRef.current?.(selectedIndex)
        return
      }

      if (e.key === 'Escape') {
        setSelectedIndex(-1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [itemCount, selectedIndex])

  return { selectedIndex, setSelectedIndex }
}
