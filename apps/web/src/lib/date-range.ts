// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 画面側の入力チェック（`End date must be on or after the start date`）と同じ文言。
// 画面を通らない経路（インライン編集・モバイル・API トークン）でも逆転した期間を保存させない。
export const DATE_ORDER_ERROR = '終了日は開始日以降にしてください'

/** 両方そろっている時だけ判定する。`YYYY-MM-DD` は文字列のまま大小比較できる */
export function isEndBeforeStart(startDate: string | null | undefined, endDate: string | null | undefined): boolean {
  return !!startDate && !!endDate && endDate < startDate
}
