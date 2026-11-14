import { describe, expect, test } from 'vitest'
import { MONTH_WHEEL_THRESHOLD, monthStepFromSwipe, monthStepFromWheel, wheelDeltaToPixels } from './calendar-period-gesture'

describe('monthStepFromWheel', () => {
  test('下方向は次の月、上方向は前の月', () => {
    expect(monthStepFromWheel(0, 80)).toBe(1)
    expect(monthStepFromWheel(0, -80)).toBe(-1)
  })

  test('横方向と静止は月を変えない', () => {
    expect(monthStepFromWheel(80, 10)).toBe(0)
    expect(monthStepFromWheel(0, 0)).toBe(0)
  })
})

describe('wheelDeltaToPixels', () => {
  test('行単位の1ノッチはピクセル閾値を超える', () => {
    const y = wheelDeltaToPixels(3, 1)
    expect(Math.abs(y)).toBeGreaterThanOrEqual(MONTH_WHEEL_THRESHOLD)
    expect(monthStepFromWheel(0, y)).toBe(1)
  })

  test('ページ単位の1ページは月を1つ送れる', () => {
    const y = wheelDeltaToPixels(-1, 2)
    expect(Math.abs(y)).toBeGreaterThanOrEqual(MONTH_WHEEL_THRESHOLD)
    expect(monthStepFromWheel(0, y)).toBe(-1)
  })

  test('ピクセル単位はそのまま比較する', () => {
    expect(wheelDeltaToPixels(40, 0)).toBe(40)
    expect(Math.abs(wheelDeltaToPixels(40, 0))).toBeLessThan(MONTH_WHEEL_THRESHOLD)
  })
})

describe('monthStepFromSwipe', () => {
  test('上スワイプは次の月、下スワイプは前の月', () => {
    expect(monthStepFromSwipe(0, -80)).toBe(1)
    expect(monthStepFromSwipe(0, 80)).toBe(-1)
  })

  test('短い移動と横スワイプは月を変えない', () => {
    expect(monthStepFromSwipe(0, -20)).toBe(0)
    expect(monthStepFromSwipe(90, -40)).toBe(0)
  })
})
