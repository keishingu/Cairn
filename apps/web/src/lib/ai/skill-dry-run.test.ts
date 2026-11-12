// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, test, vi } from 'vitest'

const { mockSelectResults, mockReserveCredits, mockEntitlements, mockIsBillingEnabled } = vi.hoisted(() => ({
  mockSelectResults: [] as unknown[][],
  mockReserveCredits: vi.fn(),
  mockEntitlements: vi.fn(),
  mockIsBillingEnabled: vi.fn(),
}))

vi.mock('@cairn/db', () => {
  const chain = () => {
    const builder = {
      from: () => builder,
      where: () => builder,
      limit: async () => mockSelectResults.shift() ?? [],
    }
    return builder
  }
  return { db: { select: chain }, aiAutomations: {}, workspaces: {} }
})
vi.mock('@cairn/core/billing', () => ({
  BILLING_CONFIG: { activeAiRequestCredits: 1, aiChatRequestCreditsByModel: { 'gpt-5': 1, 'claude-sonnet-5-5': 1, 'claude-opus-5-5': 2 } },
}))
vi.mock('@/lib/billing/credits', () => ({ reserveCreditsForActiveBenefit: mockReserveCredits, refundActiveBenefitReservation: vi.fn(async () => undefined) }))
vi.mock('@/lib/billing/entitlements', () => ({ resolveUploadEntitlements: mockEntitlements }))
vi.mock('@/lib/billing/is-billing-enabled', () => ({ isBillingEnabled: mockIsBillingEnabled }))
const { mockGenerateText, mockRecordUsage, mockFinishSkillRun } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
  mockRecordUsage: vi.fn(),
  mockFinishSkillRun: vi.fn(),
}))
vi.mock('ai', async (importOriginal) => ({ ...(await importOriginal<typeof import('ai')>()), generateText: mockGenerateText }))
vi.mock('./client', () => ({ apiKeyEnvForChatModel: () => 'OPENAI_API_KEY', chatLanguageModel: () => ({}) }))
vi.mock('./research-tools', () => ({ createResearchTools: () => ({}) }))
vi.mock('./proposal-tools', () => ({ createProposalTools: () => ({}) }))
vi.mock('./chat-usage', () => ({
  recordChatUsageAfterResponse: mockRecordUsage,
  // 原価の計算は chat-usage.test.ts で確かめるので、ここでは固定の額を返す
  chatUsageCharge: () => ({ costUsd: 0.1, credits: 23 }),
}))
vi.mock('./skill-run', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./skill-run')>()),
  reserveSkillRun: async () => 'run-1',
  finishSkillRun: mockFinishSkillRun,
}))
vi.mock('./instruction-references', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./instruction-references')>()),
  hydrateInstructionReferences: async (_ctx: unknown, texts: string[]) => texts,
}))

const CTX = { workspaceId: 'workspace-1', userId: 'user-1', role: 'admin' as const }

describe('スキルのテスト実行の利用条件', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectResults.length = 0
    mockSelectResults.push(
      [{ id: 'automation-1', name: 'assign-reviewer', kind: 'skill', instruction: '指示', compiled: { writeActions: [] } }],
      [{ aiChatModel: 'gpt-5', aiChatSystemPrompt: null }],
    )
    process.env['OPENAI_API_KEY'] = 'test'
  })

  test('課金が有効なとき、石を積んでいない admin はクレジットを使う前に断る', async () => {
    mockIsBillingEnabled.mockReturnValue(true)
    mockEntitlements.mockResolvedValue({ isActiveSupporter: false })
    const { dryRunSkill } = await import('./skill-dry-run')
    await expect(dryRunSkill(CTX, 'automation-1', '')).rejects.toMatchObject({ status: 403 })
    expect(mockReserveCredits).not.toHaveBeenCalled()
  })

  test('成功したテスト実行は、使用量を記録して原価で精算し、run にも原価のクレジットを残す', async () => {
    mockIsBillingEnabled.mockReturnValue(true)
    mockEntitlements.mockResolvedValue({ isActiveSupporter: true })
    mockReserveCredits.mockResolvedValue(true)
    const steps = [{ usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, providerMetadata: undefined, toolCalls: [], toolResults: [], finishReason: 'stop' }]
    mockGenerateText.mockResolvedValue({ text: '結果', steps })
    const { dryRunSkill } = await import('./skill-dry-run')

    await dryRunSkill(CTX, 'automation-1', '')

    expect(mockFinishSkillRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'success', creditsUsed: 23 }))
    expect(mockRecordUsage).toHaveBeenCalledTimes(1)
    const record = (mockRecordUsage.mock.calls[0]![0] as () => Record<string, unknown>)()
    expect(record).toMatchObject({
      workspaceId: 'workspace-1',
      userId: 'user-1',
      conversationId: null,
      skillRunId: 'run-1',
      model: 'gpt-5',
      requestCredits: 1,
      charged: true,
      status: 'success',
      steps,
    })
  })

  test('失敗したテスト実行は返金し、精算しない行として記録する', async () => {
    mockIsBillingEnabled.mockReturnValue(true)
    mockEntitlements.mockResolvedValue({ isActiveSupporter: true })
    mockReserveCredits.mockResolvedValue(true)
    mockGenerateText.mockRejectedValue(new Error('model failed'))
    const { dryRunSkill } = await import('./skill-dry-run')

    await expect(dryRunSkill(CTX, 'automation-1', '')).rejects.toMatchObject({ status: 500 })

    const record = (mockRecordUsage.mock.calls[0]![0] as () => Record<string, unknown>)()
    expect(record).toMatchObject({ charged: false, status: 'failed', steps: [] })
  })
})
