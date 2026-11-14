// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import {
  clampScale,
  clampTranslate,
  pinchTransform,
  resolveSwipe,
  toggleZoom,
  zoomAt,
  IDENTITY_TRANSFORM,
  MAX_SCALE,
  DOUBLE_TAP_SCALE,
} from './image-lightbox-zoom'

const SIZE = { width: 200, height: 100 }
const CENTER = { x: 500, y: 300 }

describe('clampScale', () => {
  test('等倍より小さい倍率は等倍に丸める', () => {
    expect(clampScale(0.3)).toBe(1)
  })

  test('上限を超える倍率は上限に丸める', () => {
    expect(clampScale(10)).toBe(MAX_SCALE)
  })
})

describe('clampTranslate', () => {
  test('等倍では移動できない', () => {
    expect(clampTranslate({ scale: 1, tx: 80, ty: 40 }, SIZE)).toEqual({ scale: 1, tx: 0, ty: 0 })
  })

  test('拡大で増えた幅・高さの半分までしか移動できない', () => {
    expect(clampTranslate({ scale: 2, tx: 500, ty: -500 }, SIZE)).toEqual({ scale: 2, tx: 100, ty: -50 })
  })

  test('範囲内の移動はそのまま保持する', () => {
    expect(clampTranslate({ scale: 2, tx: 30, ty: -20 }, SIZE)).toEqual({ scale: 2, tx: 30, ty: -20 })
  })
})

describe('zoomAt', () => {
  test('中心を指定した拡大では位置がずれない', () => {
    expect(zoomAt(IDENTITY_TRANSFORM, 2, CENTER, CENTER, SIZE)).toEqual({ scale: 2, tx: 0, ty: 0 })
  })

  test('指定した点が拡大後も同じ画面位置に留まる', () => {
    const point = { x: CENTER.x + 40, y: CENTER.y + 20 }
    const next = zoomAt(IDENTITY_TRANSFORM, 2, point, CENTER, SIZE)
    // 拡大前に点があった画像ローカル座標 (40, 20) が、拡大後も同じ画面位置に来る
    expect(next.tx + next.scale * 40).toBeCloseTo(point.x - CENTER.x)
    expect(next.ty + next.scale * 20).toBeCloseTo(point.y - CENTER.y)
  })

  test('拡大後にはみ出す移動量は表示範囲へ丸める', () => {
    const point = { x: CENTER.x + 1000, y: CENTER.y }
    const next = zoomAt(IDENTITY_TRANSFORM, 2, point, CENTER, SIZE)
    expect(next.tx).toBe(-100)
  })

  test('上限を超えるピンチは上限倍率で止まる', () => {
    expect(zoomAt(IDENTITY_TRANSFORM, 99, CENTER, CENTER, SIZE).scale).toBe(MAX_SCALE)
  })
})

describe('pinchTransform', () => {
  const start = { transform: IDENTITY_TRANSFORM, distance: 100, midpoint: CENTER }

  test('指間距離の比率で倍率が決まる', () => {
    expect(pinchTransform(start, 200, CENTER, CENTER, SIZE).scale).toBe(2)
  })

  test('距離を変えずに2本指を動かすと平行移動になる', () => {
    const zoomed = { transform: { scale: 2, tx: 0, ty: 0 }, distance: 100, midpoint: CENTER }
    const moved = { x: CENTER.x - 30, y: CENTER.y + 10 }
    expect(pinchTransform(zoomed, 100, moved, CENTER, SIZE)).toEqual({ scale: 2, tx: -30, ty: 10 })
  })

  test('中心が動く非対称なピンチでも開始時に触れた点が指に追従する', () => {
    // 開始時の中心は画像中心から (20, 0) の位置。拡大しつつ中心が右へ 50 動く
    const asymmetric = { transform: IDENTITY_TRANSFORM, distance: 100, midpoint: { x: CENTER.x + 20, y: CENTER.y } }
    const moved = { x: CENTER.x + 70, y: CENTER.y }
    const next = pinchTransform(asymmetric, 150, moved, CENTER, SIZE)
    expect(next.scale).toBeCloseTo(1.5)
    // 画像ローカル座標 20 の点が、移動後の中心点と同じ画面位置に来る
    expect(next.tx + next.scale * 20).toBeCloseTo(moved.x - CENTER.x)
  })

  test('開始時の指間距離が0なら倍率を変えない', () => {
    const degenerate = { transform: { scale: 2, tx: 5, ty: 5 }, distance: 0, midpoint: CENTER }
    expect(pinchTransform(degenerate, 120, CENTER, CENTER, SIZE)).toEqual(degenerate.transform)
  })
})

describe('toggleZoom', () => {
  test('等倍ならダブルタップ位置を基準に拡大する', () => {
    expect(toggleZoom(IDENTITY_TRANSFORM, CENTER, CENTER, SIZE).scale).toBe(DOUBLE_TAP_SCALE)
  })

  test('拡大中なら等倍へ戻す', () => {
    expect(toggleZoom({ scale: 2.5, tx: 30, ty: 10 }, CENTER, CENTER, SIZE)).toEqual(IDENTITY_TRANSFORM)
  })
})

describe('resolveSwipe', () => {
  test('等倍で右へ大きく動かすと前の画像へ送る', () => {
    expect(resolveSwipe(1, { x: 120, y: 10 })).toBe('prev')
  })

  test('等倍で左へ大きく動かすと次の画像へ送る', () => {
    expect(resolveSwipe(1, { x: -120, y: 10 })).toBe('next')
  })

  test('移動量が小さい場合は画像送りにしない', () => {
    expect(resolveSwipe(1, { x: 20, y: 5 })).toBeNull()
  })

  test('縦方向が優勢な場合は画像送りにしない', () => {
    expect(resolveSwipe(1, { x: 60, y: 120 })).toBeNull()
  })

  test('拡大中はパン操作なので画像送りにしない', () => {
    expect(resolveSwipe(2, { x: 200, y: 0 })).toBeNull()
  })
})
