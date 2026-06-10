// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'vitest'
import { buildGcalEvents } from './projects-calendar'
import type { GcalEventDto } from '@/app/api/calendar/google/events/route'

function makeEvent(overrides: Partial<GcalEventDto>): GcalEventDto {
  return {
    id: 'ev-1',
    title: 'テストイベント',
    startDate: '2026-06-10',
    endDate: '2026-06-10',
    isAllDay: true,
    calendarName: 'メイン',
    calendarColor: '#4285F4',
    htmlLink: 'https://calendar.google.com/event?eid=xxx',
    ...overrides,
  }
}

// 2026年6月: カレンダー表示開始は5/31(日)、表示終了は7/11(土)
const YEAR = 2026
const MONTH = 5 // 0始まりなので6月

describe('buildGcalEvents', () => {
  test('1日のみのイベントは1セルに span=1 で配置される', () => {
    const result = buildGcalEvents([makeEvent({ startDate: '2026-06-10', endDate: '2026-06-10' })], YEAR, MONTH)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ span: 1, row: 0 })
  })

  test('週をまたぐイベントは週ごとに分割され、各セグメントの span が正しく計算される', () => {
    // 6/10(水)〜6/16(火) は週をまたぐ（6/13(土)で区切られる）
    const result = buildGcalEvents([makeEvent({ startDate: '2026-06-10', endDate: '2026-06-16' })], YEAR, MONTH)

    expect(result).toHaveLength(2)
    const [first, second] = result.sort((a, b) => a.week - b.week)

    // 1セグメント目: 水(3)〜土(6) = 4日分
    expect(first).toMatchObject({ day: 3, span: 4 })
    // 2セグメント目: 日(0)〜火(2) = 3日分
    expect(second).toMatchObject({ day: 0, span: 3 })
  })

  test('表示範囲外のイベントは除外される', () => {
    const result = buildGcalEvents([makeEvent({ startDate: '2026-08-01', endDate: '2026-08-02' })], YEAR, MONTH)

    expect(result).toHaveLength(0)
  })

  test('表示範囲をまたぐイベントは表示範囲内に収まるよう切り詰められる', () => {
    // 表示開始(5/31)より前から表示終了(7/11)より後まで続くイベント
    const result = buildGcalEvents([makeEvent({ startDate: '2026-05-01', endDate: '2026-08-01' })], YEAR, MONTH)

    // 6週分(0〜5)すべてに表示される
    const weeks = new Set(result.map(e => e.week))
    expect(weeks).toEqual(new Set([0, 1, 2, 3, 4, 5]))
  })

  test('同じ週で重なる複数のイベントは異なる row に割り当てられる', () => {
    const events = [
      makeEvent({ id: 'ev-1', startDate: '2026-06-08', endDate: '2026-06-10' }),
      makeEvent({ id: 'ev-2', startDate: '2026-06-09', endDate: '2026-06-11' }),
    ]
    const result = buildGcalEvents(events, YEAR, MONTH)

    const ev1 = result.find(e => e.id === 'ev-1')!
    const ev2 = result.find(e => e.id === 'ev-2')!
    expect(ev1.row).not.toBe(ev2.row)
  })

  test('重ならない複数のイベントは同じ row に割り当てられる', () => {
    const events = [
      makeEvent({ id: 'ev-1', startDate: '2026-06-08', endDate: '2026-06-08' }),
      makeEvent({ id: 'ev-2', startDate: '2026-06-09', endDate: '2026-06-09' }),
    ]
    const result = buildGcalEvents(events, YEAR, MONTH)

    const ev1 = result.find(e => e.id === 'ev-1')!
    const ev2 = result.find(e => e.id === 'ev-2')!
    expect(ev1.row).toBe(0)
    expect(ev2.row).toBe(0)
  })

  test('calendarColor が null の場合はデフォルト色が使われる', () => {
    const result = buildGcalEvents([makeEvent({ calendarColor: null })], YEAR, MONTH)

    expect(result[0]?.color).toBe('#4285F4')
  })
})
