// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { ScheduledJobMonthlySchedule } from '@cairn/db'

const TOKYO_OFFSET_MINUTES = 9 * 60

export function clampDayOfMonth(year: number, month1Indexed: number, desiredDay: number) {
  return Math.min(desiredDay, new Date(Date.UTC(year, month1Indexed, 0)).getUTCDate())
}

function toTokyoParts(date: Date) {
  const shifted = new Date(date.getTime() + TOKYO_OFFSET_MINUTES * 60 * 1000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  }
}

function fromTokyoParts(parts: { year: number, month: number, day: number, hour: number, minute: number }) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - TOKYO_OFFSET_MINUTES * 60 * 1000)
}

export function computeNextRunAt(schedule: ScheduledJobMonthlySchedule, now = new Date()) {
  const localNow = toTokyoParts(now)
  const candidateDay = clampDayOfMonth(localNow.year, localNow.month, schedule.dayOfMonth)
  const candidate = fromTokyoParts({
    year: localNow.year,
    month: localNow.month,
    day: candidateDay,
    hour: schedule.hour,
    minute: schedule.minute,
  })

  if (candidate.getTime() > now.getTime()) return candidate

  const nextMonth = localNow.month === 12
    ? { year: localNow.year + 1, month: 1 }
    : { year: localNow.year, month: localNow.month + 1 }
  const nextDay = clampDayOfMonth(nextMonth.year, nextMonth.month, schedule.dayOfMonth)
  return fromTokyoParts({
    year: nextMonth.year,
    month: nextMonth.month,
    day: nextDay,
    hour: schedule.hour,
    minute: schedule.minute,
  })
}

export function formatPreviewDate(date: Date) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}
