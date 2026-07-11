import { describe, expect, it } from 'vitest'
import { formatChannelPeriod } from './chat-channel-list'

describe('formatChannelPeriod', () => {
  it('開始日と終了日が同じなら開いた期間に見せない', () => {
    expect(formatChannelPeriod('2026-07-14', '2026-07-14')).toBe('7/14')
  })

  it('単日でも終了時刻があれば時刻範囲を表示する', () => {
    expect(formatChannelPeriod('2026-07-14', '2026-07-14', '10:00', '12:00')).toBe('7/14 10:00〜12:00')
  })
})
