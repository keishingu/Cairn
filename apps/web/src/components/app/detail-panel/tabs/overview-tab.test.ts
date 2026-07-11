import { describe, expect, it } from 'vitest'
import { formatDateRange } from './overview-tab'

describe('formatDateRange', () => {
  it('終了日だけのマイルストーンでも期日を表示する', () => {
    expect(formatDateRange(null, '2026-07-14')).toBe('~ 7/14')
  })

  it('開始日と終了日が同じなら日付を重複させずに時刻範囲を表示する', () => {
    expect(formatDateRange('2026-07-14', '2026-07-14', '10:00', '12:00')).toBe('7/14 10:00 ~ 12:00')
  })
})
