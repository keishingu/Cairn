// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import {
  clampScale,
  clampTranslate,
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
