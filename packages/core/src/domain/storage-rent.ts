// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { BILLING_CONFIG, BYTES_PER_GIB } from './billing-config'

export interface StorageRentSettlement {
  debitCredits: number
  remainingCredits: number
}

/**
 * 指定期間に発生した家賃をクレジットで計算する。
 * JST月境界をまたぐ期間は月ごとに分割するため、cron 遅延時にも日割りの基準が崩れない。
 */
export function calculateStorageRentAccrual(
  originalBytes: number,
  startAt: Date,
  endAt: Date,
): number {
  const billableBytes = Math.max(0, originalBytes - BILLING_CONFIG.freeStorageBytes)
  if (billableBytes <= 0 || endAt <= startAt) return 0

  let cursor = startAt.getTime()
  const end = endAt.getTime()
  let accrual = 0

  while (cursor < end) {
    const { year, month } = jstYearMonth(new Date(cursor))
    const nextMonth = jstMonthStart(year, month + 1)
    const segmentEnd = Math.min(nextMonth, end)
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const monthMilliseconds = daysInMonth * 24 * 60 * 60 * 1000

    accrual += (billableBytes / BYTES_PER_GIB)
      * BILLING_CONFIG.storageRentCreditsPerGibMonth
      * ((segmentEnd - cursor) / monthMilliseconds)
    cursor = segmentEnd
  }

  return accrual
}

/**
 * 小数の家賃を整数台帳へ記帳可能な分と、次回へ繰り越す端数へ分ける。
 */
export function settleStorageRent(
  accruedCredits: number,
  carriedCredits: number,
): StorageRentSettlement {
  const total = accruedCredits + carriedCredits
  if (!Number.isFinite(total) || total < 0) {
    throw new Error('家賃クレジットは0以上の有限数で指定してください')
  }

  const debitCredits = Math.floor(total + Number.EPSILON)
  return {
    debitCredits,
    // PostgreSQL numeric(20, 8) に収まる精度へ丸め、浮動小数点の誤差を持ち越さない。
    remainingCredits: Number((total - debitCredits).toFixed(8)),
  }
}

function jstYearMonth(at: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BILLING_CONFIG.billingTimeZone,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(at)
  const valueFor = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value
  return {
    year: Number(valueFor('year')),
    month: Number(valueFor('month')),
  }
}

function jstMonthStart(year: number, month: number): number {
  // Date.UTC は month の範囲外を年へ繰り上げる。JST は夏時間を持たないため固定オフセットで安全。
  return Date.UTC(year, month - 1, 1) - 9 * 60 * 60 * 1000
}
