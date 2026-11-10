// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 請求画面の「AIの利用」（GET /api/billing/ai-usage）。/ai の依頼ごとの消費クレジットを ai_chat_usage から集計する。
// 本人には自分の依頼の明細と合計、owner / admin にはそれに加えてワークスペース全体のモデル別の合計を返す。
// 誰がいつ使ったかは本人以外に出さない（/ai の会話は本人用のため）。

import { BILLING_CONFIG } from '@cairn/core/billing'
import { isWorkspaceAdmin, type WorkspaceRole } from '@/lib/permissions'

/** 本人の明細に返す件数の上限（今月の新しい順） */
export const AI_USAGE_ITEMS_LIMIT = 100

export interface AiUsageItemDto {
  createdAt: string
  model: string
  credits: number
}

export interface AiUsageTotalsDto {
  requests: number
  credits: number
}

export interface AiUsageDto {
  billingEnabled: boolean
  /** 集計の起点（請求のタイムゾーンでの今月1日 0:00、ISO 文字列） */
  periodStart: string
  mine: AiUsageTotalsDto & { items: AiUsageItemDto[] }
  /** owner / admin だけ。ワークスペース全体のモデル別の合計 */
  workspace: (AiUsageTotalsDto & { byModel: Array<AiUsageTotalsDto & { model: string }> }) | null
}

/** ワークスペース全体の合計を見られるのは owner / admin（権限の判定は lib/permissions に集約する） */
export function canSeeWorkspaceAiUsage(role: WorkspaceRole): boolean {
  return isWorkspaceAdmin(role)
}

/** 請求のタイムゾーン（JST）での今月1日 0:00。JST は夏時間を持たないため固定オフセットで求める */
export function billingMonthStart(now: Date): Date {
  if (BILLING_CONFIG.billingTimeZone !== 'Asia/Tokyo') {
    throw new Error(`未対応の請求タイムゾーンです: ${BILLING_CONFIG.billingTimeZone}`)
  }
  const offsetMs = 9 * 60 * 60 * 1000
  const jst = new Date(now.getTime() + offsetMs)
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1) - offsetMs)
}
