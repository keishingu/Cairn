// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'

/**
 * 上下矢印キーでリスト項目を選択移動するためのフック。
 * 入力欄フォーカス時は無効化。
 *
 * @param itemCount - リストの項目数
 * @param onSelect - 選択項目が変わった時のコールバック（任意）
 * @returns selectedIndex（-1 は未選択）
 */
export function useArrowNav(itemCount: number, onSelect?: (index: number) => void) {
  const [selectedIndex, setSelectedIndex] = React.useState(-1)
  const onSelectRef = React.useRef(onSelect)
  onSelectRef.current = onSelect

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return
      if (e.code !== 'ArrowUp' && e.code !== 'ArrowDown') return

      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return

      if (itemCount === 0) return
      e.preventDefault()

      setSelectedIndex(prev => {
        const next = e.code === 'ArrowDown'
          ? Math.min(prev + 1, itemCount - 1)
          : Math.max(prev - 1, 0)
        onSelectRef.current?.(next)
        return next
      })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [itemCount])

  return { selectedIndex, setSelectedIndex }
}
