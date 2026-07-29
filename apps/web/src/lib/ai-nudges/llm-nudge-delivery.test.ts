// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'

vi.mock('@cairn/db', () => ({}))

import { shouldReconcilePhaseTwoRisk } from './llm-nudge-delivery'

describe('Phase 2 リスク照合', () => {
  it('資金不足で未評価の入力は既存リスクの解消判定に使わない', () => {
    const result = {
      input: { isUnansweredAskRecheck: false },
      candidates: [],
      fundingBlocked: true,
    }

    expect(shouldReconcilePhaseTwoRisk(result)).toBe(false)
  })
})
