// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'
import { isBillingEnabled } from '@/lib/billing/is-billing-enabled'
import {
  AI_USAGE_ITEMS_LIMIT,
  billingMonthStart,
  canSeeWorkspaceAiUsage,
  type AiUsageDto,
} from '@/lib/billing/ai-usage'

// 請求画面の「AIの利用」。今月の /ai の消費クレジットを返す（集計の仕様は lib/billing/ai-usage.ts）。
// ゲストも /ai を使えるので、自分の明細はゲストにも返す
export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const forbidden = requireRole(ctx.role, 'guest')
  if (forbidden) return forbidden

  const periodStart = billingMonthStart(new Date())
  if (!isBillingEnabled()) {
    return NextResponse.json({
      billingEnabled: false,
      periodStart: periodStart.toISOString(),
      mine: { requests: 0, credits: 0, items: [] },
      workspace: null,
    } satisfies AiUsageDto)
  }

  try {
    const { aiChatUsage, db } = await import('@cairn/db')
    const { and, desc, eq, gte, isNotNull, sql } = await import('drizzle-orm')
    // 消費したクレジット。原価で精算した行は credits_charged、精算を始める前の行は保存した依頼の見積もり（返金した失敗は除く）
    const credits = sql<number>`COALESCE(${aiChatUsage.creditsCharged}, CASE WHEN ${aiChatUsage.status} = 'success' THEN ${aiChatUsage.requestCredits} END)`
    const inWorkspaceThisMonth = and(
      eq(aiChatUsage.workspaceId, ctx.workspaceId),
      gte(aiChatUsage.createdAt, periodStart),
      isNotNull(credits),
    )
    const mineCondition = and(inWorkspaceThisMonth, eq(aiChatUsage.userId, ctx.userId))
    const totals = { requests: sql<string>`COUNT(*)`, credits: sql<string>`COALESCE(SUM(${credits}), 0)` }

    const [items, [mineTotals], byModel] = await Promise.all([
      db
        .select({ createdAt: aiChatUsage.createdAt, model: aiChatUsage.model, credits })
        .from(aiChatUsage)
        .where(mineCondition)
        .orderBy(desc(aiChatUsage.createdAt))
        .limit(AI_USAGE_ITEMS_LIMIT),
      db.select(totals).from(aiChatUsage).where(mineCondition),
      canSeeWorkspaceAiUsage(ctx.role)
        ? db
            .select({ model: aiChatUsage.model, ...totals })
            .from(aiChatUsage)
            .where(inWorkspaceThisMonth)
            .groupBy(aiChatUsage.model)
            .orderBy(aiChatUsage.model)
        : Promise.resolve(null),
    ])

    const workspaceByModel = byModel?.map((row) => ({
      model: row.model,
      requests: Number(row.requests),
      credits: Number(row.credits),
    }))
    return NextResponse.json({
      billingEnabled: true,
      periodStart: periodStart.toISOString(),
      mine: {
        requests: Number(mineTotals?.requests ?? 0),
        credits: Number(mineTotals?.credits ?? 0),
        items: items.map((item) => ({
          createdAt: item.createdAt.toISOString(),
          model: item.model,
          credits: Number(item.credits),
        })),
      },
      workspace: workspaceByModel
        ? {
            requests: workspaceByModel.reduce((sum, row) => sum + row.requests, 0),
            credits: workspaceByModel.reduce((sum, row) => sum + row.credits, 0),
            byModel: workspaceByModel,
          }
        : null,
    } satisfies AiUsageDto)
  } catch (err) {
    console.error('[/api/billing/ai-usage GET]', err)
    return NextResponse.json({ error: 'AIの利用状況の取得に失敗しました' }, { status: 500 })
  }
}
