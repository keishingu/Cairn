// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test, vi } from 'vitest'

vi.mock('next/server', () => ({ after: vi.fn() }))

import {
  buildChatUsageRow,
  chatUsageCharge,
  chatUsageSettlement,
  type ChatUsageRecord,
  type ChatUsageStep,
} from './chat-usage'

const step = (
  promptTokens: number,
  completionTokens: number,
  toolNames: string[],
  providerMetadata: ChatUsageStep['providerMetadata'] = undefined,
  finishReason: string | null = 'stop',
): ChatUsageStep => ({
  usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
  providerMetadata,
  toolCalls: toolNames.map((toolName) => ({ toolName })),
  finishReason,
})

const record = (overrides: Partial<ChatUsageRecord> = {}): ChatUsageRecord => ({
  workspaceId: 'ws-1',
  userId: 'user-1',
  conversationId: 'conv-1',
  assistantMessageId: 'msg-1',
  skillRunId: null,
  model: 'claude-sonnet-5-5',
  requestCredits: 10,
  charged: true,
  status: 'success',
  error: null,
  durationMs: 1234,
  steps: [],
  ...overrides,
})

describe('原価に応じた消費クレジット', () => {
  // Sonnet 5.5: 出力 $10 / 100万。出力 20,000 トークン = $0.2 → ¥30 × 1.5 = 45 クレジット
  const sonnetSteps = [step(0, 20_000, [], { anthropic: { cacheCreationInputTokens: 0, cacheReadInputTokens: 0 } })]

  test('回答を保存した依頼は、原価と原価から換算したクレジットを記録する', () => {
    const row = buildChatUsageRow(record({ requestCredits: 30, steps: sonnetSteps }))

    expect(row.costUsd).toBe('0.200000')
    expect(row.creditsCharged).toBe(45)
  })

  test('返金した依頼・課金が無効な環境は消費を記録しない（原価は記録する）', () => {
    expect(buildChatUsageRow(record({ charged: false, steps: sonnetSteps }))).toMatchObject({ costUsd: '0.200000', creditsCharged: null })
    expect(buildChatUsageRow(record({ requestCredits: null, steps: sonnetSteps })).creditsCharged).toBeNull()
  })

  test('見積もりより高ければ差を追加で引き、安ければ差を戻す', () => {
    const higher = chatUsageSettlement(buildChatUsageRow(record({ requestCredits: 30, steps: sonnetSteps })))
    expect(higher).toEqual({ delta: -15, refId: 'settle:msg-1' })

    const lower = chatUsageSettlement(buildChatUsageRow(record({ requestCredits: 60, steps: sonnetSteps })))
    expect(lower).toEqual({ delta: 15, refId: 'settle:msg-1' })
  })

  test('差が無い・消費していない依頼は精算しない', () => {
    expect(chatUsageSettlement(buildChatUsageRow(record({ requestCredits: 45, steps: sonnetSteps })))).toBeNull()
    expect(chatUsageSettlement(buildChatUsageRow(record({ charged: false, steps: sonnetSteps })))).toBeNull()
    expect(chatUsageSettlement(buildChatUsageRow(record({ requestCredits: null, steps: sonnetSteps })))).toBeNull()
  })

  test('chatUsageCharge は記録と同じ計算で原価とクレジットを返す', () => {
    expect(chatUsageCharge('claude-sonnet-5-5', sonnetSteps)).toEqual({ costUsd: 0.2, credits: 45 })
  })
})

describe('buildChatUsageRow', () => {
  test('全ステップの入力・出力・キャッシュを合計する', () => {
    const row = buildChatUsageRow(
      record({
        steps: [
          step(100, 10, ['searchDocuments'], { anthropic: { cacheCreationInputTokens: 500, cacheReadInputTokens: 0 } }, 'tool-calls'),
          step(200, 30, [], { anthropic: { cacheCreationInputTokens: 0, cacheReadInputTokens: 500 } }),
        ],
      }),
    )

    expect(row).toMatchObject({
      steps: 2,
      inputTokens: 300,
      outputTokens: 40,
      cacheReadInputTokens: 500,
      cacheCreationInputTokens: 500,
      durationMs: 1234,
      requestCredits: 10,
      status: 'success',
      error: null,
    })
  })

  test('ステップごとの内訳を配列で持つ', () => {
    const row = buildChatUsageRow(
      record({ steps: [step(100, 10, ['getTask'], undefined, 'tool-calls'), step(200, 30, [])] }),
    )

    expect(row.stepUsage).toEqual([
      { inputTokens: 100, outputTokens: 10, cacheReadInputTokens: null, cacheCreationInputTokens: null, toolNames: ['getTask'], finishReason: 'tool-calls' },
      { inputTokens: 200, outputTokens: 30, cacheReadInputTokens: null, cacheCreationInputTokens: null, toolNames: [], finishReason: 'stop' },
    ])
  })

  test('tool 名は呼び出し順に、重複を残して平坦にする', () => {
    const row = buildChatUsageRow(
      record({ steps: [step(1, 1, ['searchDocuments', 'getTask']), step(1, 1, ['searchDocuments'])] }),
    )

    expect(row.toolNames).toEqual(['searchDocuments', 'getTask', 'searchDocuments'])
  })

  test('OpenAI のキャッシュ済みトークンをキャッシュ読みとして正規化し、書き込みは null にする', () => {
    const row = buildChatUsageRow(
      record({ model: 'gpt-5', steps: [step(1000, 20, [], { openai: { cachedPromptTokens: 800 } })] }),
    )

    expect(row.cacheReadInputTokens).toBe(800)
    expect(row.cacheCreationInputTokens).toBeNull()
    expect(row.stepUsage[0]).toMatchObject({ cacheReadInputTokens: 800, cacheCreationInputTokens: null })
  })

  test('ステップが無い失敗の行は、トークン 0・キャッシュ null・課金無効なら credits null になる', () => {
    const row = buildChatUsageRow(
      record({ status: 'failed', error: 'credit_reservation_failed', requestCredits: null, steps: [] }),
    )

    expect(row).toMatchObject({
      status: 'failed',
      error: 'credit_reservation_failed',
      requestCredits: null,
      steps: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: null,
      cacheCreationInputTokens: null,
      toolNames: [],
      stepUsage: [],
    })
  })
})
