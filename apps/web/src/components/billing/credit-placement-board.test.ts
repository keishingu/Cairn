// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import {
  shouldRefreshContributionsAfterError,
  stoneSpecForLedgerId,
  toWorldPoint,
} from './credit-placement-board'

describe('shouldRefreshContributionsAfterError', () => {
  it('同じ付与を別のメンバーが先に配置した競合ではキューを再取得する', () => {
    expect(shouldRefreshContributionsAfterError(409)).toBe(true)
  })

  it('競合以外の保存失敗ではキューを再取得しない', () => {
    expect(shouldRefreshContributionsAfterError(400)).toBe(false)
    expect(shouldRefreshContributionsAfterError(500)).toBe(false)
  })
})

describe('stoneSpecForLedgerId', () => {
  it('同じ付与行は再描画後も同じ有機的な石形状になる', () => {
    expect(stoneSpecForLedgerId('11111111-1111-4111-8111-111111111111')).toEqual(
      stoneSpecForLedgerId('11111111-1111-4111-8111-111111111111'),
    )
  })

  it('別の付与行には形状の揺らぎを与える', () => {
    expect(stoneSpecForLedgerId('11111111-1111-4111-8111-111111111111')).not.toEqual(
      stoneSpecForLedgerId('22222222-2222-4222-8222-222222222222'),
    )
  })
})

describe('toWorldPoint', () => {
  it('表示サイズが変わっても同じ相対位置を同じ物理座標へ変換する', () => {
    expect(toWorldPoint({ x: 320, y: 180, width: 640, height: 360 })).toEqual({ x: 320, y: 180 })
    expect(toWorldPoint({ x: 640, y: 310, width: 1280, height: 620 })).toMatchObject({
      x: expect.closeTo(320),
      y: expect.closeTo(180),
    })
    expect(toWorldPoint({ x: 164, y: 180, width: 328, height: 360 })).toMatchObject({
      x: expect.closeTo(320),
      y: expect.closeTo(180),
    })
  })
})
