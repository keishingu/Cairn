// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import type { StorageKey } from '@/lib/storage-keys'

const KEYBOARD_STEP = 16

export function clampWidth(width: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(width)))
}

/** 保存値が数値として読めない場合は既定幅を使う（壊れた値でレイアウトを崩さない） */
export function parseStoredWidth(saved: string | null, fallback: number, min: number, max: number): number {
  if (saved === null) return fallback
  const parsed = Number(saved)
  return Number.isFinite(parsed) ? clampWidth(parsed, min, max) : fallback
}

/**
 * 左側パネルの幅を、右端の区切り線のドラッグ・矢印キーで変えられるようにする。
 * 幅は端末ごとの好みなので localStorage にだけ保存する。
 */
export function useResizableWidth({ storageKey, defaultWidth, min, max }: {
  storageKey: StorageKey
  defaultWidth: number
  min: number
  max: number
}) {
  const [width, setWidth] = React.useState(defaultWidth)
  const [dragging, setDragging] = React.useState(false)
  const dragStart = React.useRef<{ pointerX: number; width: number } | null>(null)

  // SSR と初回描画を一致させるため、保存値はマウント後に読む
  // localStorage はプライベートブラウズやストレージ無効化で例外を投げる。幅は表示の好みなので、読めなければ既定幅で続ける
  React.useEffect(() => {
    let saved: string | null = null
    try { saved = localStorage.getItem(storageKey) } catch (err) { console.warn('Failed to read the stored width', err) }
    setWidth(parseStoredWidth(saved, defaultWidth, min, max))
  }, [storageKey, defaultWidth, min, max])

  const commit = React.useCallback((next: number) => {
    const clamped = clampWidth(next, min, max)
    setWidth(clamped)
    // 保存に失敗しても、この画面での幅変更とドラッグの終了処理は続ける
    try { localStorage.setItem(storageKey, String(clamped)) } catch (err) { console.warn('Failed to save the width', err) }
  }, [storageKey, min, max])

  const endDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (!dragStart.current) return
    commit(dragStart.current.width + e.clientX - dragStart.current.pointerX)
    dragStart.current = null
    setDragging(false)
  }

  const handleProps = {
    role: 'separator',
    'aria-orientation': 'vertical',
    'aria-valuenow': width,
    'aria-valuemin': min,
    'aria-valuemax': max,
    tabIndex: 0,
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      // テキスト選択の開始を止め、ポインタがハンドルから外れてもドラッグを追従させる
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      dragStart.current = { pointerX: e.clientX, width }
      setDragging(true)
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (!dragStart.current) return
      setWidth(clampWidth(dragStart.current.width + e.clientX - dragStart.current.pointerX, min, max))
    },
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onDoubleClick: () => commit(defaultWidth),
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); commit(width - KEYBOARD_STEP) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); commit(width + KEYBOARD_STEP) }
      else if (e.key === 'Home') { e.preventDefault(); commit(min) }
      else if (e.key === 'End') { e.preventDefault(); commit(max) }
    },
  } satisfies React.HTMLAttributes<HTMLElement>

  return { width, dragging, handleProps }
}
