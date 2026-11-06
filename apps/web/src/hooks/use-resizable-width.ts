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

/** 画面に収める上限。保存した希望幅は変えず、表示だけを狭める */
export function fitWidth(width: number, ceiling?: number | undefined): number {
  if (ceiling == null || !Number.isFinite(ceiling)) return width
  return Math.min(width, Math.max(0, Math.round(ceiling)))
}

/**
 * パネルの幅を、区切り線のドラッグ・矢印キーで変えられるようにする。
 * `edge` は区切り線の位置。`end` は左パネルの右端、`start` は右パネルの左端。
 * 矢印キーは区切り線をその方向へ動かす。幅は端末ごとの好みなので localStorage にだけ保存する。
 * `ceiling` は今の画面に収まる表示幅の上限。希望幅の保存値は変えず、窓が広がると元の幅に戻す。
 */
export function useResizableWidth({ storageKey, defaultWidth, min, max, edge = 'end', ceiling }: {
  storageKey: StorageKey
  defaultWidth: number
  min: number
  max: number
  edge?: 'start' | 'end'
  ceiling?: number | undefined
}) {
  const [width, setWidth] = React.useState(defaultWidth)
  const [dragging, setDragging] = React.useState(false)
  const dragStart = React.useRef<{ pointerX: number; width: number } | null>(null)
  const preferredRef = React.useRef(defaultWidth)
  const draggingRef = React.useRef(false)
  // 右パネルの左端は、左へ動かすとパネルが広がる
  const direction = edge === 'start' ? -1 : 1

  // SSR と初回描画は一致させつつ、保存幅はブラウザの描画前に復元する。
  // チャンネル移動で再マウントされても、既定幅が一瞬表示されるのを防ぐ。
  // localStorage はプライベートブラウズやストレージ無効化で例外を投げる。幅は表示の好みなので、読めなければ既定幅で続ける
  React.useLayoutEffect(() => {
    // ドラッグ中に窓幅が変わっても、指についている幅を保存値で上書きしない
    if (draggingRef.current) return
    let saved: string | null = null
    try { saved = localStorage.getItem(storageKey) } catch (err) { console.warn('Failed to read the stored width', err) }
    const preferred = parseStoredWidth(saved, defaultWidth, min, max)
    preferredRef.current = preferred
    setWidth(fitWidth(preferred, ceiling))
  }, [storageKey, defaultWidth, min, max, ceiling])

  const commit = React.useCallback((next: number) => {
    const preferred = clampWidth(next, min, max)
    preferredRef.current = preferred
    setWidth(fitWidth(preferred, ceiling))
    // 保存に失敗しても、この画面での幅変更とドラッグの終了処理は続ける
    try { localStorage.setItem(storageKey, String(preferred)) } catch (err) { console.warn('Failed to save the width', err) }
  }, [storageKey, min, max, ceiling])

  const endDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (!dragStart.current) return
    commit(dragStart.current.width + (e.clientX - dragStart.current.pointerX) * direction)
    dragStart.current = null
    draggingRef.current = false
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
      draggingRef.current = true
      setDragging(true)
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (!dragStart.current) return
      const next = clampWidth(dragStart.current.width + (e.clientX - dragStart.current.pointerX) * direction, min, max)
      setWidth(fitWidth(next, ceiling))
    },
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onDoubleClick: () => commit(defaultWidth),
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); commit(width - KEYBOARD_STEP * direction) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); commit(width + KEYBOARD_STEP * direction) }
      else if (e.key === 'Home') { e.preventDefault(); commit(min) }
      else if (e.key === 'End') { e.preventDefault(); commit(max) }
    },
  } satisfies React.HTMLAttributes<HTMLElement>

  return { width, dragging, handleProps }
}
