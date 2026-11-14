// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { after } from 'next/server'
import type { AiChatUsageError, AiChatUsageStatus, AiChatUsageStep } from '@cairn/db'
import { aiChatCostUsd, aiChatCreditsForCost } from '@cairn/core/billing'
import { summarizeChatCacheUsage, summarizeStepUsage, type ChatStepUsage } from './cache-usage'

export type ChatUsageError = AiChatUsageError

// AI SDK の step オブジェクトをそのまま渡せる最小の形
export interface ChatUsageStep extends ChatStepUsage {
  // AI SDK の ToolCallUnion は tools の型引数によって undefined を含む形に解決されるため、undefined も受ける
  toolCalls: readonly ({ toolName: string } | undefined)[]
  finishReason?: string | null
}

export interface ChatUsageRecord {
  workspaceId: string
  userId: string | null
  conversationId: string | null
  assistantMessageId: string
  skillRunId: string | null
  model: string
  // 送信前に押さえた見積もりのクレジット。課金が無効なときは null
  requestCredits: number | null
  // 押さえたクレジットを返金せずに残した（回答を保存した）とき true。true のときだけ原価で精算する
  charged: boolean
  status: AiChatUsageStatus
  error: ChatUsageError | null
  durationMs: number
  steps: readonly ChatUsageStep[]
}

/** 全ステップの原価（USD）と、それに応じて消費するクレジット */
export function chatUsageCharge(model: string, steps: readonly ChatStepUsage[]): { costUsd: number; credits: number } {
  const totals = summarizeChatCacheUsage(steps)
  const costUsd = aiChatCostUsd(model, totals)
  return { costUsd, credits: aiChatCreditsForCost(costUsd) }
}

// ai_chat_usage に入れる値を組み立てる。失敗でステップが無い依頼は 0 トークン・キャッシュ null の行になる
export function buildChatUsageRow(record: ChatUsageRecord) {
  const totals = summarizeChatCacheUsage(record.steps)
  const { costUsd, credits } = chatUsageCharge(record.model, record.steps)
  const stepUsage: AiChatUsageStep[] = record.steps.map((step) => ({
    ...summarizeStepUsage(step),
    toolNames: step.toolCalls.flatMap((call) => (call ? [call.toolName] : [])),
    finishReason: step.finishReason ?? null,
  }))
  return {
    workspaceId: record.workspaceId,
    userId: record.userId,
    conversationId: record.conversationId,
    assistantMessageId: record.assistantMessageId,
    skillRunId: record.skillRunId,
    model: record.model,
    status: record.status,
    error: record.error,
    requestCredits: record.requestCredits,
    costUsd: costUsd.toFixed(6),
    // 課金が無効（見積もりが null）・返金した依頼は消費していない
    creditsCharged: record.requestCredits !== null && record.charged ? credits : null,
    steps: totals.steps,
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    cacheReadInputTokens: totals.cacheReadInputTokens,
    cacheCreationInputTokens: totals.cacheCreationInputTokens,
    toolNames: stepUsage.flatMap((step) => step.toolNames),
    stepUsage,
    durationMs: Math.max(0, Math.round(record.durationMs)),
  }
}

/**
 * 押さえた見積もりと原価のクレジットの差を記帳する値。見積もりより安ければ差を戻し（正）、高ければ追加で引く（負。
 * 残高がマイナスになりうるが、マイナスの間は次の依頼を送れない）。差が無い・精算しない依頼は null
 */
export function chatUsageSettlement(row: ReturnType<typeof buildChatUsageRow>): { delta: number; refId: string } | null {
  if (row.requestCredits === null || row.creditsCharged === null) return null
  const delta = row.requestCredits - row.creditsCharged
  if (delta === 0) return null
  return { delta, refId: `settle:${row.assistantMessageId}` }
}

// 原価の記録とクレジットの精算。応答を返した後に書き、ストリームを待たせない。
// build は応答の完了後に評価されるので、onFinish / onError が最後にセットした状態を読める。
// 記録と精算は同じトランザクションで行い、精算だけが残る・記録だけが残ることを避ける。
// 失敗しても利用者の応答には影響させない（その依頼は見積もりのクレジットのまま残る）
export function recordChatUsageAfterResponse(build: () => ChatUsageRecord | null): void {
  after(async () => {
    try {
      const record = build()
      if (!record) return
      const { db, aiChatUsage, creditLedger } = await import('@cairn/db')
      const row = buildChatUsageRow(record)
      const settlement = chatUsageSettlement(row)
      await db.transaction(async (tx) => {
        await tx.insert(aiChatUsage).values(row)
        if (settlement) {
          await tx
            .insert(creditLedger)
            .values({ workspaceId: row.workspaceId, delta: settlement.delta, reason: 'ai_consumption', refId: settlement.refId })
            .onConflictDoNothing()
        }
      })
    } catch (err) {
      console.error('[AI chat] failed to record usage and settle credits:', err)
    }
  })
}
