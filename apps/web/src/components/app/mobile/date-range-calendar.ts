// 日程シートのカレンダー計算。日付は `YYYY-MM-DD` 文字列のまま扱い、タイムゾーンで日がずれないようにする

export type RangeTarget = 'start' | 'end'

export interface RangeSelection {
  start: string | null
  end: string | null
  /** 次にタップした日をどちらに入れるか */
  target: RangeTarget
}

export function toIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseIsoDate(iso: string): { year: number; monthIndex: number; day: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return { year: y!, monthIndex: m! - 1, day: d! }
}

/** 月表示の7列グリッド。前月・翌月の埋め草は null（日曜始まり） */
export function buildMonthGrid(year: number, monthIndex: number): (string | null)[] {
  const firstWeekday = new Date(year, monthIndex, 1).getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const cells: (string | null)[] = Array.from({ length: firstWeekday }, () => null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(toIsoDate(year, monthIndex, day))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function shiftMonth(year: number, monthIndex: number, delta: number): { year: number; monthIndex: number } {
  const d = new Date(year, monthIndex + delta, 1)
  return { year: d.getFullYear(), monthIndex: d.getMonth() }
}

/**
 * 日付のタップを選択に反映する。
 * - 開始を選ぶと、続けて終了を選べるよう対象を終了へ進める。終了より後ろへ動かした時だけ終了を外す
 * - 終了に開始より前の日を選んだ時は、逆転した期間を作らず開始として扱う
 * 終了だけ直したい時に開始が消えないよう、対象は利用者が明示的に切り替えられる
 */
export function applyDateTap(selection: RangeSelection, date: string): RangeSelection {
  if (selection.target === 'start') {
    const end = selection.end && selection.end < date ? null : selection.end
    return { start: date, end, target: 'end' }
  }
  if (!selection.start || date < selection.start) {
    return { start: date, end: selection.end && selection.end >= date ? selection.end : null, target: 'end' }
  }
  return { ...selection, end: date }
}

export function isInRange(date: string, start: string | null, end: string | null): boolean {
  return !!start && !!end && date > start && date < end
}
