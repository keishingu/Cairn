// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'

/**
 * 上下矢印キーでリスト項目を選択移動する共通プリミティブ（use-arrow-nav の後継）。
 *
 *  - 素の ↑/↓ で選択を移動（修飾キー併用時・入力欄フォーカス時は無効）
 *  - 選択行が画面外に出ないよう scrollIntoView で追従する
 *  - `count` は「実際に描画している可視行数」を渡す（折りたたみ等で隠れた行は含めない）
 *  - 行に `data-list-index={i}` を付けると scroll 対象を特定できる
 *
 * @param count          可視行数
 * @param containerRef   scroll 対象を探すコンテナ（省略時は document 全体）
 * @param onEnter        選択中に Enter を押した時のコールバック
 */
export function useListSelection({
  count,
  containerRef,
  onEnter,
}: {
  count: number
  containerRef?: React.RefObject<HTMLElement | null>
  onEnter?: (index: number) => void
}): { selectedIndex: number; setSelectedIndex: (i: number) => void } {
  const [selectedIndex, setSelectedIndex] = React.useState(-1)
  const onEnterRef = React.useRef(onEnter)
  onEnterRef.current = onEnter
  const selectedRef = React.useRef(selectedIndex)
  selectedRef.current = selectedIndex

  // 件数が減ったら範囲内にクランプ
  React.useEffect(() => {
    if (selectedIndex > count - 1) setSelectedIndex(count - 1)
  }, [count, selectedIndex])

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return
      if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return

      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        if (count === 0) return
        e.preventDefault()
        setSelectedIndex(prev =>
          e.code === 'ArrowDown'
            ? Math.min(prev + 1, count - 1)
            : Math.max(prev - 1, 0),
        )
        return
      }
      if (e.code === 'Enter' && selectedRef.current >= 0) {
        e.preventDefault()
        onEnterRef.current?.(selectedRef.current)
        return
      }
      if (e.key === 'Escape') setSelectedIndex(-1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [count])

  // 選択行を画面内へスクロール（off-screen 選択を防ぐ）
  React.useEffect(() => {
    if (selectedIndex < 0) return
    const root: ParentNode = containerRef?.current ?? document
    const el = root.querySelector<HTMLElement>(`[data-list-index="${selectedIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex, containerRef])

  return { selectedIndex, setSelectedIndex }
}
