import { describe, expect, it } from 'vitest'
import { applyDateTap, buildMonthGrid, isInRange, shiftMonth } from './date-range-calendar'

describe('applyDateTap（日程シートの日付タップ）', () => {
  it('開始を選ぶと対象が終了へ進み、終了より前なら終了を残す', () => {
    expect(applyDateTap({ start: '2026-06-12', end: '2026-06-16', target: 'start' }, '2026-06-13'))
      .toEqual({ start: '2026-06-13', end: '2026-06-16', target: 'end' })
  })

  it('開始を終了より後ろへ動かすと逆転しないよう終了を外す', () => {
    expect(applyDateTap({ start: '2026-06-12', end: '2026-06-16', target: 'start' }, '2026-06-20'))
      .toEqual({ start: '2026-06-20', end: null, target: 'end' })
  })

  it('終了を選んでいる時は開始を変えずに終了だけ変える', () => {
    expect(applyDateTap({ start: '2026-06-13', end: '2026-06-16', target: 'end' }, '2026-06-18'))
      .toEqual({ start: '2026-06-13', end: '2026-06-18', target: 'end' })
  })

  it('終了に開始より前の日を選ぶと開始として扱い、逆転した期間を作らない', () => {
    expect(applyDateTap({ start: '2026-06-13', end: '2026-06-16', target: 'end' }, '2026-06-10'))
      .toEqual({ start: '2026-06-10', end: '2026-06-16', target: 'end' })
  })

  it('開始と同じ日を終了に選ぶと1日だけの予定になる', () => {
    expect(applyDateTap({ start: '2026-06-14', end: null, target: 'end' }, '2026-06-14'))
      .toEqual({ start: '2026-06-14', end: '2026-06-14', target: 'end' })
  })
})

describe('カレンダーの月計算', () => {
  it('月初の曜日まで空欄で埋め、7の倍数のマスにする', () => {
    const cells = buildMonthGrid(2026, 5) // 2026年6月は月曜始まり
    expect(cells[0]).toBeNull()
    expect(cells[1]).toBe('2026-06-01')
    expect(cells.filter(Boolean)).toHaveLength(30)
    expect(cells.length % 7).toBe(0)
  })

  it('年をまたいで前後の月へ移れる', () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, monthIndex: 11 })
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, monthIndex: 0 })
  })

  it('期間の内側だけを帯の対象にする', () => {
    expect(isInRange('2026-06-14', '2026-06-13', '2026-06-16')).toBe(true)
    expect(isInRange('2026-06-13', '2026-06-13', '2026-06-16')).toBe(false)
    expect(isInRange('2026-06-14', '2026-06-13', null)).toBe(false)
  })
})
