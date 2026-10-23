// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'

vi.mock('@cairn/db', () => ({}))

import {
  hasPhaseTwoChannelAdvanced,
  selectPhaseTwoDeliveryCandidates,
  shouldReconcilePhaseTwoRisk,
} from './llm-nudge-delivery'

describe('Phase 2 リスク照合', () => {
  it('資金不足で未評価の入力は既存リスクの解消判定に使わない', () => {
    const result = {
      input: { isUnansweredAskRecheck: false },
      candidates: [],
      fundingBlocked: true,
    }

    expect(shouldReconcilePhaseTwoRisk(result)).toBe(false)
  })

  it('二次判定済み候補をconfidenceで再び除外しない', () => {
    const candidate = {
      workspaceId: 'workspace-1',
      userId: 'user-1',
      channelId: 'channel-1',
      projectId: null,
      messageId: 'message-1',
      detector: 'unanswered_ask' as const,
      dedupeKey: 'unanswered_ask:message-1',
      title: '確認',
      body: '確認してください',
      confidence: 0.58,
      reason: {},
    }

    expect(selectPhaseTwoDeliveryCandidates([{ candidates: [candidate] }])).toEqual([candidate])
  })

  it('判定後に通常投稿があれば配信前に候補を失効させる', () => {
    expect(
      hasPhaseTwoChannelAdvanced(
        '2026-09-21T17:00:00.000Z',
        new Date('2026-09-21T23:00:00.000Z'),
      ),
    ).toBe(true)
    expect(
      hasPhaseTwoChannelAdvanced(
        '2026-09-21T17:00:00.000Z',
        new Date('2026-09-21T17:00:00.000Z'),
      ),
    ).toBe(false)
  })
})
