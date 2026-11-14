// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export const CALENDAR_WEEK_STARTS = ['sunday', 'monday'] as const
export type CalendarWeekStart = (typeof CALENDAR_WEEK_STARTS)[number]

export const DEFAULT_CALENDAR_WEEK_START: CalendarWeekStart = 'sunday'

export function isCalendarWeekStart(value: unknown): value is CalendarWeekStart {
  return CALENDAR_WEEK_STARTS.includes(value as CalendarWeekStart)
}
