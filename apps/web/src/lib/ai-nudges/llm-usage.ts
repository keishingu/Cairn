// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { db, workspaces } from '@cairn/db'
import { eq, sql } from 'drizzle-orm'

interface ModelUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export interface PhaseTwoTokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

function nonNegativeInteger(value: number | undefined): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

// AI SDK v4 の prompt/completion/total を、画面に表示する入力・出力・合計へ正規化する。
// total がプロバイダーから返らない場合だけ、入力と出力の和を採用する。
export function normalizePhaseTwoTokenUsage(usage: ModelUsage): PhaseTwoTokenUsage {
  const inputTokens = nonNegativeInteger(usage.promptTokens)
  const outputTokens = nonNegativeInteger(usage.completionTokens)
  const reportedTotal = nonNegativeInteger(usage.totalTokens)
  return {
    inputTokens,
    outputTokens,
    totalTokens: reportedTotal || inputTokens + outputTokens,
  }
}

// 利用量の記録失敗を LLM 呼び出しの失敗として扱うと、Inngest の再試行で同じ推論を再実行して
// 余分な課金が発生する。そのため記録は呼び出し後の best-effort とし、失敗は監視ログに残す。
export async function recordPhaseTwoTokenUsage(workspaceId: string, usage: ModelUsage): Promise<void> {
  const tokens = normalizePhaseTwoTokenUsage(usage)
  try {
    await db
      .update(workspaces)
      .set({
        aiNudgesPhaseTwoInputTokens: sql`${workspaces.aiNudgesPhaseTwoInputTokens} + ${tokens.inputTokens}`,
        aiNudgesPhaseTwoOutputTokens: sql`${workspaces.aiNudgesPhaseTwoOutputTokens} + ${tokens.outputTokens}`,
        aiNudgesPhaseTwoTotalTokens: sql`${workspaces.aiNudgesPhaseTwoTotalTokens} + ${tokens.totalTokens}`,
        aiNudgesPhaseTwoRequestCount: sql`${workspaces.aiNudgesPhaseTwoRequestCount} + 1`,
      })
      .where(eq(workspaces.id, workspaceId))
  } catch (error) {
    console.error('[ai-nudges] Phase 2 token usage recording failed:', error)
  }
}
