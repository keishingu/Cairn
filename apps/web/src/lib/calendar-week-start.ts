import {
  DEFAULT_CALENDAR_WEEK_START,
  isCalendarWeekStart,
  type CalendarWeekStart,
} from '@cairn/shared'
import { STORAGE_KEYS } from './storage-keys'

/** 設定取得前の描画用。保存の正は profiles.calendar_week_start。 */
export function readStoredCalendarWeekStart(): CalendarWeekStart {
  if (typeof window === 'undefined') return DEFAULT_CALENDAR_WEEK_START
  const stored = localStorage.getItem(STORAGE_KEYS.calendar_week_start)
  return isCalendarWeekStart(stored) ? stored : DEFAULT_CALENDAR_WEEK_START
}

export function writeStoredCalendarWeekStart(value: CalendarWeekStart) {
  localStorage.setItem(STORAGE_KEYS.calendar_week_start, value)
}
