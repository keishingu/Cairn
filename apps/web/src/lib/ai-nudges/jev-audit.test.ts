// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { summarizeJevDecision } from './jev-audit'

describe('Jev判定履歴', () => {
  it('ignore・閾値落ち・通過を確率分布付きで区別する', () => {
    expect(
      summarizeJevDecision(
        {
          type: 'choice',
          choice: 'ignore',
          probabilities: { ignore: 0.7, unanswered_ask: 0.2, llm_risk: 0.1 },
        },
        0.9,
      ),
    ).toMatchObject({ selectedLabel: 'ignore', selectedProbability: 0.7, outcome: 'ignore' })
    expect(
      summarizeJevDecision(
        {
          type: 'choice',
          choice: 'unanswered_ask',
          probabilities: { ignore: 0.08, unanswered_ask: 0.88, llm_risk: 0.04 },
        },
        0.9,
      ),
    ).toMatchObject({
      selectedLabel: 'unanswered_ask',
      selectedProbability: 0.88,
      outcome: 'below_threshold',
    })
    expect(
      summarizeJevDecision(
        {
          type: 'choice',
          choice: 'llm_risk',
          probabilities: { ignore: 0.01, unanswered_ask: 0.01, llm_risk: 0.98 },
        },
        0.9,
      ),
    ).toMatchObject({ selectedLabel: 'llm_risk', selectedProbability: 0.98, outcome: 'passed' })
  })

  it('通知不要のboolean判定をignoreとして残す', () => {
    expect(summarizeJevDecision({ type: 'boolean', probability: 0.2 }, 0.9)).toEqual({
      selectedLabel: 'false',
      probabilities: { true: 0.2, false: 0.8 },
      selectedProbability: 0.8,
      outcome: 'ignore',
    })
  })
})
