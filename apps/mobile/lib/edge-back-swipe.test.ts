import { describe, expect, test } from 'vitest'
import { isEdgeBackSwipe } from './edge-back-swipe'

describe('isEdgeBackSwipe', () => {
  test('画面の左端から右へ動かしたときは戻る', () => {
    expect(isEdgeBackSwipe({ moveX: 60, dx: 50, dy: 4 })).toBe(true)
  })

  test('画面の中央から右へ動かしても戻らない', () => {
    expect(isEdgeBackSwipe({ moveX: 260, dx: 80, dy: 2 })).toBe(false)
  })

  test('縦方向の動きが大きいときや移動量が小さいときは戻らない', () => {
    expect(isEdgeBackSwipe({ moveX: 40, dx: 30, dy: 40 })).toBe(false)
    expect(isEdgeBackSwipe({ moveX: 20, dx: 10, dy: 0 })).toBe(false)
  })
})
