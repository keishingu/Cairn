// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useT } from '@/components/locale-provider'
import { Icon } from './primitives'
import {
  clampTranslate,
  pinchTransform,
  resolveSwipe,
  toggleZoom,
  IDENTITY_TRANSFORM,
  MIN_SCALE,
  type PinchStart,
  type Transform,
} from './image-lightbox-zoom'

export interface LightboxImage {
  /** リスト内で一意なキー（インデックス特定に使う） */
  key: string
  src: string
  alt?: string
  /** 下部に表示するキャプション（ファイル名・プロジェクト名など） */
  caption?: React.ReactNode
  /** 枚数カウンタの横に表示する補足情報（撮影日など） */
  meta?: React.ReactNode
}

/** ダブルタップとみなす間隔(ms)と、その間の許容ぶれ幅(px) */
const DOUBLE_TAP_INTERVAL = 300
const TAP_SLOP = 12

// ギャラリーと同じ Lightroom 風の拡大表示。チャット・ギャラリーで共用する
export const ImageLightbox = ({ images, index, onIndexChange, onClose }: {
  images: LightboxImage[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
}) => {
  const t = useT()
  const item = images[index] ?? null
  const goPrev = () => { if (index > 0) onIndexChange(index - 1) }
  const goNext = () => { if (index < images.length - 1) onIndexChange(index + 1) }

  const [transform, setTransform] = React.useState<Transform>(IDENTITY_TRANSFORM)
  const [animating, setAnimating] = React.useState(false)
  const isZoomed = transform.scale > MIN_SCALE

  const stageRef = React.useRef<HTMLDivElement | null>(null)
  const imgRef = React.useRef<HTMLImageElement | null>(null)
  /** 追跡中のポインタ（ピンチ判定のため複数持つ） */
  const pointersRef = React.useRef(new Map<number, { x: number; y: number }>())
  /** ピンチ開始時の transform・指間距離・中心点 */
  const pinchRef = React.useRef<PinchStart | null>(null)
  /** 1本指ドラッグの直前位置と開始位置 */
  const dragRef = React.useRef<{ lastX: number; lastY: number; startX: number; startY: number } | null>(null)
  const lastTapRef = React.useRef<{ time: number; x: number; y: number } | null>(null)
  /** ピンチ直後に誤ってスワイプ・タップ判定しないためのフラグ */
  const gestureConsumedRef = React.useRef(false)

  // 画像の表示サイズ（transform は layout に影響しないので等倍時のサイズが取れる）
  const getSize = () => {
    const el = imgRef.current
    return el ? { width: el.offsetWidth, height: el.offsetHeight } : { width: 0, height: 0 }
  }
  const getCenter = () => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  const resetTransform = React.useCallback(() => {
    setAnimating(false)
    setTransform(IDENTITY_TRANSFORM)
  }, [])

  // 画像を切り替えたらズームを解除する
  React.useEffect(() => { resetTransform() }, [index, resetTransform])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'Escape') {
        if (isZoomed) resetTransform()
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, images.length, isZoomed])

  const applyToggleZoom = (x: number, y: number) => {
    setAnimating(true)
    setTransform(prev => toggleZoom(prev, { x, y }, getCenter(), getSize()))
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // マウスは左右のクリックゾーンで画像送りする。ここで pointer capture を取ると
    // 続く pointerup と click がステージへ向き、ゾーンの onClick が発火しなくなる
    if (e.pointerType === 'mouse') return

    e.currentTarget.setPointerCapture(e.pointerId)
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values())
      if (!a || !b) return
      pinchRef.current = {
        transform,
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      }
      dragRef.current = null
      gestureConsumedRef.current = true
    } else if (pointersRef.current.size === 1) {
      dragRef.current = { lastX: e.clientX, lastY: e.clientY, startX: e.clientX, startY: e.clientY }
      gestureConsumedRef.current = false
    }
    setAnimating(false)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    const pinch = pinchRef.current
    if (pinch && pointersRef.current.size >= 2) {
      const [a, b] = Array.from(pointersRef.current.values())
      if (!a || !b) return
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      setTransform(pinchTransform(pinch, distance, midpoint, getCenter(), getSize()))
      return
    }

    const drag = dragRef.current
    if (!drag || pointersRef.current.size !== 1) return
    const dx = e.clientX - drag.lastX
    const dy = e.clientY - drag.lastY
    drag.lastX = e.clientX
    drag.lastY = e.clientY
    // 拡大中だけパンする。等倍時の1本指移動は画像送りのスワイプ判定に使う
    if (transform.scale > MIN_SCALE) {
      setTransform(prev => clampTranslate({ ...prev, tx: prev.tx + dx, ty: prev.ty + dy }, getSize()))
    }
  }

  const finishPointer = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const drag = dragRef.current
    const wasSinglePointer = pointersRef.current.size === 1
    pointersRef.current.delete(e.pointerId)

    if (pointersRef.current.size < 2) pinchRef.current = null
    if (pointersRef.current.size === 0) {
      dragRef.current = null
    } else if (pointersRef.current.size === 1 && !dragRef.current) {
      // ピンチから1本指へ戻ったとき、残った指の現在位置を起点にしてパンを続ける
      const [remaining] = Array.from(pointersRef.current.values())
      if (remaining) {
        dragRef.current = {
          lastX: remaining.x, lastY: remaining.y,
          startX: remaining.x, startY: remaining.y,
        }
      }
    }

    if (cancelled || !drag || !wasSinglePointer) return

    const delta = { x: e.clientX - drag.startX, y: e.clientY - drag.startY }
    const moved = Math.hypot(delta.x, delta.y)

    if (gestureConsumedRef.current) return

    if (moved > TAP_SLOP) {
      const swipe = resolveSwipe(transform.scale, delta)
      if (swipe === 'prev') goPrev()
      else if (swipe === 'next') goNext()
      return
    }

    // タップ／クリック：2回連続ならズームをトグルする
    const now = Date.now()
    const last = lastTapRef.current
    if (last && now - last.time < DOUBLE_TAP_INTERVAL && Math.hypot(e.clientX - last.x, e.clientY - last.y) < TAP_SLOP * 2) {
      lastTapRef.current = null
      applyToggleZoom(e.clientX, e.clientY)
    } else {
      lastTapRef.current = { time: now, x: e.clientX, y: e.clientY }
    }
  }

  if (!item) return null

  const navZonesEnabled = !isZoomed

  return (
    <div
      onClick={() => { if (!isZoomed) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--z-lightbox)',
        background: 'rgba(0,0,0,0.9)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <div
        ref={stageRef}
        onClick={e => e.stopPropagation()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={e => finishPointer(e, false)}
        onPointerCancel={e => finishPointer(e, true)}
        style={{
          position: 'relative', maxWidth: '90vw', maxHeight: '90vh', display: 'flex',
          touchAction: 'none',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={item.src}
          alt={item.alt ?? ''}
          draggable={false}
          style={{
            maxWidth: '90vw', maxHeight: '90vh', borderRadius: 10, objectFit: 'contain', display: 'block',
            transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
            transition: animating ? 'transform 180ms ease-out' : 'none',
            cursor: isZoomed ? 'grab' : 'default',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        />
        {/* 左クリックゾーン（前へ）。マウス用。拡大中は無効にする */}
        <div
          onClick={e => { e.stopPropagation(); goPrev() }}
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: '40%',
            cursor: index > 0 ? 'w-resize' : 'default',
            pointerEvents: navZonesEnabled ? 'auto' : 'none',
          }}
        />
        {/* 右クリックゾーン（次へ） */}
        <div
          onClick={e => { e.stopPropagation(); goNext() }}
          style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: '40%',
            cursor: index < images.length - 1 ? 'e-resize' : 'default',
            pointerEvents: navZonesEnabled ? 'auto' : 'none',
          }}
        />
      </div>

      {/* メタ情報 */}
      {(item.caption || item.meta || images.length > 1) && (
        <div style={{
          position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          pointerEvents: 'none',
        }}>
          {item.caption && (
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
              {item.caption}
            </div>
          )}
          {(images.length > 1 || item.meta) && (
            <div style={{
              fontSize: 12, color: 'rgba(255,255,255,0.65)',
              background: 'rgba(0,0,0,0.4)', padding: '3px 10px', borderRadius: 20,
            }}>
              {images.length > 1 ? `${index + 1} / ${images.length}` : ''}
              {images.length > 1 && item.meta ? ' · ' : ''}
              {item.meta}
            </div>
          )}
        </div>
      )}

      {/* 閉じるボタン */}
      <button
        onClick={e => { e.stopPropagation(); onClose() }}
        aria-label={t('Close')}
        style={{
          position: 'absolute', top: 16, right: 16,
          width: 36, height: 36, borderRadius: 10,
          border: 'none', background: 'rgba(255,255,255,0.15)',
          color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Icon name="close" size={18}/>
      </button>
    </div>
  )
}
