// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { after } from 'next/server'
import type { AiChatUsageError, AiChatUsageStatus, AiChatUsageStep } from '@cairn/db'
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
  // 課金が無効なときは null
  requestCredits: number | null
  status: AiChatUsageStatus
  error: ChatUsageError | null
  durationMs: number
  steps: readonly ChatUsageStep[]
}

// ai_chat_usage に入れる値を組み立てる。失敗でステップが無い依頼は 0 トークン・キャッシュ null の行になる
export function buildChatUsageRow(record: ChatUsageRecord) {
  const totals = summarizeChatCacheUsage(record.steps)
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

// 原価の実測のための記録。応答を返した後に書き、ストリームを待たせない。
// build は応答の完了後に評価されるので、onFinish / onError が最後にセットした状態を読める。
// 記録に失敗しても利用者の応答には影響させない
export function recordChatUsageAfterResponse(build: () => ChatUsageRecord | null): void {
  after(async () => {
    try {
      const record = build()
      if (!record) return
      const { db, aiChatUsage } = await import('@cairn/db')
      await db.insert(aiChatUsage).values(buildChatUsageRow(record))
    } catch (err) {
      console.error('[AI chat] failed to record usage:', err)
    }
  })
}
