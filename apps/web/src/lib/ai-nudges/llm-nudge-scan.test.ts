// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { hasCreditsForPhaseTwoScan, resolvePhaseTwoScanCandidateBudget } from './llm-nudge-scan'

describe('Phase 2 スキャンのクレジット判定', () => {
  it('Heartbeat配信費用未満ではLLMスキャンを開始しない', () => {
    expect(hasCreditsForPhaseTwoScan(9)).toBe(false)
  })

  it('Heartbeat配信費用ちょうどならLLMスキャンを開始できる', () => {
    expect(hasCreditsForPhaseTwoScan(10)).toBe(true)
  })

  it('バッチの候補枠を残高から算出する', () => {
    expect(resolvePhaseTwoScanCandidateBudget(29)).toBe(2)
  })
})
