// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import {
  blocksPhaseTwoPrimaryCandidate,
  blocksPhaseTwoCandidateRefinement,
  hasCreditsForPhaseTwoScan,
  isPhaseTwoPrimaryCandidateEligible,
  restrictPhaseTwoRecipientsToFixedRecipient,
  resolvePhaseTwoScanCandidateBudget,
} from './llm-nudge-scan'

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

  it('active・resolved・再通知待ちの候補は精査前に除外する', () => {
    const now = new Date('2026-07-25T00:00:00.000Z')
    expect(blocksPhaseTwoCandidateRefinement('active', null, now)).toBe(true)
    expect(blocksPhaseTwoCandidateRefinement('resolved', null, now)).toBe(true)
    expect(
      blocksPhaseTwoCandidateRefinement('dismissed', new Date('2026-07-26T00:00:00.000Z'), now),
    ).toBe(true)
    expect(blocksPhaseTwoCandidateRefinement('suppressed', null, now)).toBe(false)
  })

  it('固定受信者が無効な未回答質問の再通知は精査前に除外する', () => {
    const now = new Date('2026-07-25T00:00:00.000Z')
    expect(
      blocksPhaseTwoPrimaryCandidate({
        detector: 'unanswered_ask',
        status: 'dismissed',
        remindAfter: now,
        recipientEnabled: false,
        recipientCanAccess: true,
        now,
      }),
    ).toBe(true)
    expect(
      blocksPhaseTwoPrimaryCandidate({
        detector: 'unanswered_ask',
        status: 'suppressed',
        remindAfter: null,
        recipientEnabled: true,
        recipientCanAccess: false,
        now,
      }),
    ).toBe(true)
    expect(
      blocksPhaseTwoPrimaryCandidate({
        detector: 'unanswered_ask',
        status: 'dismissed',
        remindAfter: now,
        recipientEnabled: true,
        recipientCanAccess: true,
        now,
      }),
    ).toBe(false)
  })

  it('再通知の未回答質問は固定受信者だけを精査候補にする', () => {
    const recipients = [{ userId: 'user-1' }, { userId: 'user-2' }]
    expect(restrictPhaseTwoRecipientsToFixedRecipient(recipients, 'user-2')).toEqual([
      { userId: 'user-2' },
    ])
    expect(restrictPhaseTwoRecipientsToFixedRecipient(recipients, undefined)).toEqual(recipients)
  })

  it('直接返信済みまたは24時間未満の未回答質問は精査枠を消費しない', () => {
    const candidate = {
      detector: 'unanswered_ask' as const,
      sourceMessageId: 'message-1',
      observation: '回答待ち',
    }
    const now = new Date('2026-07-25T12:00:00.000Z')
    expect(
      isPhaseTwoPrimaryCandidateEligible({
        candidate,
        source: { createdAt: new Date('2026-07-25T11:00:00.000Z'), senderId: 'sender-1' },
        hasDirectReply: false,
        now,
      }),
    ).toBe(false)
    expect(
      isPhaseTwoPrimaryCandidateEligible({
        candidate,
        source: { createdAt: new Date('2026-07-24T11:00:00.000Z'), senderId: 'sender-1' },
        hasDirectReply: true,
        now,
      }),
    ).toBe(false)
  })
})
