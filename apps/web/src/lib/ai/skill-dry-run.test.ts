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
vi.mock('@cairn/core/billing', () => ({ BILLING_CONFIG: { activeAiRequestCredits: 1 } }))
vi.mock('@/lib/billing/credits', () => ({ reserveCreditsForActiveBenefit: mockReserveCredits, refundActiveBenefitReservation: vi.fn() }))
vi.mock('@/lib/billing/entitlements', () => ({ resolveUploadEntitlements: mockEntitlements }))
vi.mock('@/lib/billing/is-billing-enabled', () => ({ isBillingEnabled: mockIsBillingEnabled }))
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
})
