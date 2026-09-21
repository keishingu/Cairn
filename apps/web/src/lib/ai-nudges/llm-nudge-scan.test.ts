// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import {
  blocksPhaseTwoPrimaryCandidate,
  blocksPhaseTwoCandidateRefinement,
  buildPhaseTwoJevScreenBatches,
  extractPhaseTwoCandidatesFromJev,
  hasCreditsForPhaseTwoScan,
  isPhaseTwoFundingBlocked,
  isPhaseTwoPrimaryCandidateEligible,
  rankPhaseTwoRecipientsForJev,
  restrictPhaseTwoRecipientsToFixedRecipient,
  resolvePhaseTwoScanCandidateBudget,
  type PhaseTwoChannelInput,
} from './llm-nudge-scan'

function channelInput(messageCount = 18): PhaseTwoChannelInput {
  const messages = Array.from({ length: messageCount }, (_, index) => ({
    id: `message-${index}`,
    senderId: `user-${index % 2}`,
    senderName: `利用者${index % 2}`,
    parentMessageId: null,
    content: 'あ'.repeat(700),
    createdAt: new Date(Date.UTC(2026, 6, 24, index)).toISOString(),
    isNew: true,
  }))
  return {
    channelId: 'channel-1',
    workspaceId: 'workspace-1',
    projectId: null,
    channelName: '開発',
    messages,
    newMessageIds: messages.map((message) => message.id),
    recheckMessageIds: [],
    scannedThroughMessageId: messages.at(-1)!.id,
    scannedThroughCreatedAt: messages.at(-1)!.createdAt,
    isUnansweredAskRecheck: false,
    advancesCursor: true,
    nextUnansweredAskCheckAt: null,
    nextUnansweredAskMessageId: null,
  }
}

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
      screenConfidence: 0.95,
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

  it('スキャン時の残高不足はカーソル保持が必要な状態として区別する', () => {
    expect(isPhaseTwoFundingBlocked('funding_blocked')).toBe(true)
    expect(isPhaseTwoFundingBlocked('disabled')).toBe(false)
  })
})

describe('Phase 2のJev判定入力', () => {
  it('対象を16件ずつに分け、本文を600文字までに制限する', () => {
    const batches = buildPhaseTwoJevScreenBatches(
      channelInput(),
      new Date('2026-07-25T12:00:00.000Z'),
    )
    expect(batches).toHaveLength(2)
    expect(batches[0]!.targets).toHaveLength(16)
    expect(batches[1]!.targets).toHaveLength(2)
    const state = batches[0]!.state as { messages: Array<{ content: string }> }
    expect(Math.max(...state.messages.map((message) => message.content.length))).toBe(600)
  })

  it('再評価ではllm_riskを選択肢に含めない', () => {
    const input = channelInput(1)
    input.isUnansweredAskRecheck = true
    input.recheckMessageIds = ['message-0']
    const question = buildPhaseTwoJevScreenBatches(input)[0]!.questions['candidate_0']
    expect(question?.type).toBe('choice')
    if (question?.type === 'choice') {
      expect(question.criteria).toEqual({
        ignore: expect.any(String),
        unanswered_ask: expect.any(String),
      })
    }
  })

  it('確率0.7以上の分類だけを候補へ変換する', () => {
    const batch = buildPhaseTwoJevScreenBatches(channelInput(2))[0]!
    const candidates = extractPhaseTwoCandidatesFromJev(batch, {
      candidate_0: {
        type: 'choice',
        choice: 'unanswered_ask',
        probabilities: { ignore: 0.2, unanswered_ask: 0.7, llm_risk: 0.1 },
      },
      candidate_1: {
        type: 'choice',
        choice: 'llm_risk',
        probabilities: { ignore: 0.3, unanswered_ask: 0.01, llm_risk: 0.69 },
      },
    })
    expect(candidates).toEqual([
      expect.objectContaining({
        detector: 'unanswered_ask',
        sourceMessageId: 'message-0',
        screenConfidence: 0.7,
      }),
    ])
  })

  it('宛先候補は関連タスク、メンション、発言数の順に絞る', () => {
    const base = {
      displayName: '利用者',
      role: 'member',
      skills: [],
    }
    const recipients = rankPhaseTwoRecipientsForJev([
      {
        ...base,
        userId: 'recent',
        mentionedInSource: false,
        recentMessageCount: 3,
        relatedTaskCount: 0,
      },
      {
        ...base,
        userId: 'mentioned',
        mentionedInSource: true,
        recentMessageCount: 0,
        relatedTaskCount: 0,
      },
      {
        ...base,
        userId: 'task',
        mentionedInSource: false,
        recentMessageCount: 0,
        relatedTaskCount: 1,
      },
    ])
    expect(recipients.map((recipient) => recipient.userId)).toEqual(['task', 'mentioned', 'recent'])
  })
})
