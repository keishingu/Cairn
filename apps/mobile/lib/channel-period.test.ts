import { describe, expect, it } from 'vitest'
import { formatChannelPeriod } from './channel-period'

describe('チャンネル期間表示', () => {
  it('単日のプロジェクトは月日だけを表示する', () => {
    expect(formatChannelPeriod('2026-07-14', '2026-07-14')).toBe('7/14')
  })

  it('複数日の期間を短く表示する', () => {
    expect(formatChannelPeriod('2026-07-14', '2026-07-16')).toBe('7/14〜7/16')
  })

  it('単日でも時刻があれば時刻範囲を表示する', () => {
    expect(formatChannelPeriod('2026-07-14', '2026-07-14', '10:00:00', '12:00:00')).toBe(
      '7/14 10:00〜12:00',
    )
  })
})
