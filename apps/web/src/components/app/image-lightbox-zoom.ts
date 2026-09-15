// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * ライトボックスのズーム計算。
 * DOM に依存しない純粋関数として切り出し、ジェスチャ挙動を単体テストできるようにする。
 */

/** 等倍。これ以下には縮小しない */
export const MIN_SCALE = 1
/** ピンチで拡大できる上限 */
export const MAX_SCALE = 4
/** ダブルタップ／ダブルクリックで切り替える倍率 */
export const DOUBLE_TAP_SCALE = 2.5

export interface Transform {
  scale: number
  tx: number
  ty: number
}

export const IDENTITY_TRANSFORM: Transform = { scale: 1, tx: 0, ty: 0 }

export const clampScale = (scale: number): number =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))

/**
 * 画像がコンテナから離れないように移動量を丸める。
 * transform-origin が中央なので、拡大で増えた幅・高さの半分が移動できる上限になる。
 */
export const clampTranslate = (
  { scale, tx, ty }: Transform,
  size: { width: number; height: number },
): Transform => {
  const maxX = Math.max(0, (size.width * scale - size.width) / 2)
  const maxY = Math.max(0, (size.height * scale - size.height) / 2)
  return {
    scale,
    tx: Math.min(maxX, Math.max(-maxX, tx)),
    ty: Math.min(maxY, Math.max(-maxY, ty)),
  }
}

/**
 * 指定した画面座標の点を固定したまま倍率を変える。
 * ピンチの中心点・ダブルタップ位置がずれないようにするために使う。
 */
export const zoomAt = (
  current: Transform,
  nextScale: number,
  point: { x: number; y: number },
  center: { x: number; y: number },
  size: { width: number; height: number },
): Transform => {
  const scale = clampScale(nextScale)
  // 画像ローカル座標（中心からの距離、等倍換算）
  const localX = (point.x - center.x - current.tx) / current.scale
  const localY = (point.y - center.y - current.ty) / current.scale
  return clampTranslate({
    scale,
    tx: point.x - center.x - scale * localX,
    ty: point.y - center.y - scale * localY,
  }, size)
}

/** 等倍なら拡大、拡大中なら等倍へ戻すトグル */
export const toggleZoom = (
  current: Transform,
  point: { x: number; y: number },
  center: { x: number; y: number },
  size: { width: number; height: number },
): Transform =>
  current.scale > MIN_SCALE
    ? IDENTITY_TRANSFORM
    : zoomAt(current, DOUBLE_TAP_SCALE, point, center, size)

/** 画像送りと判定するスワイプの最小移動量(px) */
export const SWIPE_THRESHOLD = 48

/** 等倍時の1本指スワイプを画像送りとして解釈する。拡大中はパンなので null */
export const resolveSwipe = (
  scale: number,
  delta: { x: number; y: number },
): 'prev' | 'next' | null => {
  if (scale > MIN_SCALE) return null
  if (Math.abs(delta.x) < SWIPE_THRESHOLD) return null
  if (Math.abs(delta.x) <= Math.abs(delta.y)) return null
  return delta.x > 0 ? 'prev' : 'next'
}
