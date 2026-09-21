// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { jevEvaluationRequestByteLength } from '@/lib/ai/jev'
import {
  blocksPhaseTwoPrimaryCandidate,
  blocksPhaseTwoCandidateRefinement,
  buildPhaseTwoJevScreenBatches,
  buildPhaseTwoJevRefineRequest,
  extractPhaseTwoCandidatesFromJev,
  hasCreditsForPhaseTwoScan,
  isPhaseTwoFundingBlocked,
  isPhaseTwoPrimaryCandidateEligible,
  mergePhaseTwoContinuationMessages,
  PHASE_TWO_JEV_REFINE_REQUEST_BYTE_LIMIT,
  rankPhaseTwoRecipientsForJev,
  resolvePhaseTwoJevRefinement,
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
    evaluatedAt: new Date('2026-07-25T12:00:00.000Z').toISOString(),
    hasUnloadedMessagesAfterScanWindow: false,
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

  it('二次判定へ評価時刻までの後続通常投稿と該当者なしを渡す', () => {
    const input = channelInput(12)
    input.messages[2]!.content = `${'依頼の前提。'.repeat(50)}この件を確認できますか？`
    input.messages[10]!.content = `${'回答の前提。'.repeat(180)}対応完了しました。`
    const request = buildPhaseTwoJevRefineRequest(
      input,
      {
        detector: 'unanswered_ask',
        sourceMessageId: 'message-2',
        observation: '回答待ち',
        screenConfidence: 0.72,
      },
      [
        {
          userId: 'user-1',
          displayName: '利用者1',
          role: 'member',
          mentionedInSource: true,
          recentMessageCount: 2,
          relatedTaskCount: 0,
          skills: [],
        },
      ],
      new Date('2026-07-24T10:30:00.000Z'),
    )!

    const state = request.state as {
      evaluatedAt: string
      messages: Array<{ id: string; content: string }>
    }
    expect(state.evaluatedAt).toBe('2026-07-24T10:30:00.000Z')
    expect(state.messages.map((message) => message.id)).toContain('message-10')
    expect(state.messages.map((message) => message.id)).not.toContain('message-11')
    expect(state.messages.find((message) => message.id === 'message-2')?.content).toContain(
      'この件を確認できますか？',
    )
    expect(state.messages.find((message) => message.id === 'message-10')?.content).toContain(
      '対応完了しました。',
    )
    expect(request.questions['resolution']?.type).toBe('choice')
    expect(request.questions['recipient']).toMatchObject({
      type: 'choice',
      criteria: expect.objectContaining({ recipient_none: expect.any(String) }),
    })
    expect(request.questions['recipientEvidence']).toMatchObject({
      type: 'choice',
      criteria: expect.objectContaining({ evidence_none: expect.any(String) }),
    })
  })

  it('日本語と絵文字が多い後続会話でも二次判定リクエストを24KB以内に収める', () => {
    const input = channelInput(120)
    input.evaluatedAt = '2026-08-01T00:00:00.000Z'
    for (const message of input.messages) message.content = '対応状況😀'.repeat(500)
    const request = buildPhaseTwoJevRefineRequest(
      input,
      {
        detector: 'unanswered_ask',
        sourceMessageId: 'message-2',
        observation: '回答待ち',
        screenConfidence: 0.72,
      },
      Array.from({ length: 30 }, (_, index) => ({
        userId: `recipient-${index}`,
        displayName: `担当者${index}`,
        role: 'member',
        mentionedInSource: index === 0,
        recentMessageCount: 1,
        relatedTaskCount: 0,
        skills: ['障害対応😀'.repeat(30)],
      })),
      new Date(input.evaluatedAt),
    )

    expect(request).not.toBeNull()
    expect(jevEvaluationRequestByteLength(request!)).toBeLessThanOrEqual(
      PHASE_TWO_JEV_REFINE_REQUEST_BYTE_LIMIT,
    )
    expect(request!.contextMessages.some((message) => message.id === 'message-2')).toBe(true)
  })

  it('100件窓より後の通常回答を補完し、候補とカーソルを失わず回答済みにする', () => {
    const input = channelInput(100)
    input.messages[0]!.content = 'この障害の対応方針を教えてください。'
    input.evaluatedAt = '2026-07-29T00:00:00.000Z'
    input.hasUnloadedMessagesAfterScanWindow = true
    const merged = mergePhaseTwoContinuationMessages(input, [
      {
        id: 'message-100',
        senderId: 'recipient',
        senderName: '担当者',
        parentMessageId: null,
        content: '確認して復旧しました。',
        createdAt: '2026-07-28T04:00:00.000Z',
        isNew: false,
      },
    ])
    const candidate = {
      detector: 'unanswered_ask' as const,
      sourceMessageId: 'message-0',
      observation: '回答待ち',
      screenConfidence: 0.72,
    }
    const rankedRecipients = [
      {
        userId: 'recipient',
        displayName: '担当者',
        role: 'member',
        mentionedInSource: false,
        recentMessageCount: 1,
        relatedTaskCount: 0,
        skills: [],
      },
    ]
    const request = buildPhaseTwoJevRefineRequest(
      merged,
      candidate,
      rankedRecipients,
      new Date(input.evaluatedAt),
    )!

    expect(merged.hasUnloadedMessagesAfterScanWindow).toBe(false)
    expect(merged.scannedThroughMessageId).toBe('message-99')
    expect(merged.advancesCursor).toBe(true)
    expect(request.contextMessages.at(-1)).toMatchObject({
      id: 'message-100',
      content: '確認して復旧しました。',
    })
    expect(
      resolvePhaseTwoJevRefinement({
        candidate,
        rankedRecipients,
        recipientEvidence: request.recipientEvidence,
        answers: {
          resolution: {
            type: 'choice',
            choice: 'answered',
            probabilities: { answered: 0.9, open: 0.1 },
          },
          shouldNotify: { type: 'boolean', probability: 0.1 },
          recipient: {
            type: 'choice',
            choice: 'recipient_none',
            probabilities: { recipient_none: 0.9 },
          },
          recipientEvidence: {
            type: 'choice',
            choice: 'evidence_none',
            probabilities: { evidence_none: 0.9 },
          },
        },
      }),
    ).toBeNull()
  })

  it('回答済み・期限切れは通知確率や宛先確率が高くても除外する', () => {
    const candidate = {
      detector: 'unanswered_ask' as const,
      sourceMessageId: 'message-1',
      observation: '回答待ち',
      screenConfidence: 0.72,
    }
    const rankedRecipients = [
      {
        userId: 'recipient',
        displayName: '受信者',
        role: 'member',
        mentionedInSource: true,
        recentMessageCount: 0,
        relatedTaskCount: 0,
        skills: [],
      },
    ]
    const answers = {
      shouldNotify: { type: 'boolean' as const, probability: 0.99 },
      recipient: {
        type: 'choice' as const,
        choice: 'recipient_0',
        probabilities: { recipient_0: 0.99, recipient_none: 0.01 },
      },
      recipientEvidence: {
        type: 'choice' as const,
        choice: 'evidence_direct_0',
        probabilities: { evidence_direct_0: 0.99, evidence_none: 0.01 },
      },
    }

    for (const resolution of ['answered', 'expired'] as const) {
      expect(
        resolvePhaseTwoJevRefinement({
          candidate,
          rankedRecipients,
          recipientEvidence: {
            evidence_direct_0: {
              messageId: candidate.sourceMessageId,
              supportedRecipientLabels: ['recipient_0'],
            },
          },
          answers: {
            ...answers,
            resolution: {
              type: 'choice',
              choice: resolution,
              probabilities: { open: 0.01, [resolution]: 0.99 },
            },
          },
        }),
      ).toBeNull()
    }
  })

  it('未解決で通知価値があり宛先根拠がある依頼だけ候補へ進める', () => {
    const decision = resolvePhaseTwoJevRefinement({
      candidate: {
        detector: 'unanswered_ask',
        sourceMessageId: 'message-1',
        observation: '回答待ち',
        screenConfidence: 0.7,
      },
      rankedRecipients: [
        {
          userId: 'recipient',
          displayName: '受信者',
          role: 'member',
          mentionedInSource: true,
          recentMessageCount: 0,
          relatedTaskCount: 0,
          skills: [],
        },
      ],
      recipientEvidence: {
        evidence_direct_0: {
          messageId: 'message-1',
          supportedRecipientLabels: ['recipient_0'],
        },
      },
      answers: {
        resolution: {
          type: 'choice',
          choice: 'open',
          probabilities: { open: 0.62, insufficient_context: 0.38 },
        },
        shouldNotify: { type: 'boolean', probability: 0.58 },
        recipient: {
          type: 'choice',
          choice: 'recipient_0',
          probabilities: { recipient_0: 0.61, recipient_none: 0.39 },
        },
        recipientEvidence: {
          type: 'choice',
          choice: 'evidence_direct_0',
          probabilities: { evidence_direct_0: 0.6, evidence_none: 0.4 },
        },
      },
    })

    expect(decision).toMatchObject({
      recipient: { userId: 'recipient' },
      resolutionProbability: 0.62,
      notifyProbability: 0.58,
      recipientProbability: 0.61,
      evidenceProbability: 0.6,
    })
  })

  it('メンションやタスクがなくても具体的な過去発言を根拠に適任者を選べる', () => {
    const input = channelInput(4)
    input.messages[0]!.senderId = 'recipient'
    input.messages[0]!.content = '請求フローの運用と障害対応は私が担当しています。'
    input.messages[1]!.senderId = 'asker'
    input.messages[1]!.content = '請求処理が止まっています。確認できる方はいますか？'
    const candidate = {
      detector: 'unanswered_ask' as const,
      sourceMessageId: 'message-1',
      observation: '回答待ち',
      screenConfidence: 0.74,
    }
    const rankedRecipients = [
      {
        userId: 'recipient',
        displayName: '運用担当',
        role: 'member',
        mentionedInSource: false,
        recentMessageCount: 1,
        relatedTaskCount: 0,
        skills: ['請求運用'],
      },
    ]
    const request = buildPhaseTwoJevRefineRequest(
      input,
      candidate,
      rankedRecipients,
      new Date(input.evaluatedAt),
    )!
    const evidenceLabel = Object.entries(request.recipientEvidence).find(
      ([, evidence]) => evidence.messageId === 'message-0',
    )?.[0]
    expect(evidenceLabel).toBeDefined()

    expect(
      resolvePhaseTwoJevRefinement({
        candidate,
        rankedRecipients,
        recipientEvidence: request.recipientEvidence,
        answers: {
          resolution: { type: 'choice', choice: 'open', probabilities: { open: 0.8 } },
          shouldNotify: { type: 'boolean', probability: 0.7 },
          recipient: {
            type: 'choice',
            choice: 'recipient_0',
            probabilities: { recipient_0: 0.7, recipient_none: 0.3 },
          },
          recipientEvidence: {
            type: 'choice',
            choice: evidenceLabel!,
            probabilities: { [evidenceLabel!]: 0.72, evidence_none: 0.28 },
          },
        },
      }),
    ).toMatchObject({ recipient: { userId: 'recipient' }, evidenceMessageId: 'message-0' })
  })

  it('根拠のない相対1位やrecipient_noneは通知先にしない', () => {
    const candidate = {
      detector: 'llm_risk' as const,
      sourceMessageId: 'message-1',
      observation: 'リスク',
      screenConfidence: 0.8,
    }
    const rankedRecipients = [
      {
        userId: 'recent',
        displayName: '最近の発言者',
        role: 'member',
        mentionedInSource: false,
        recentMessageCount: 10,
        relatedTaskCount: 0,
        skills: [],
      },
    ]
    const baseAnswers = {
      resolution: {
        type: 'choice' as const,
        choice: 'open',
        probabilities: { open: 0.99 },
      },
      shouldNotify: { type: 'boolean' as const, probability: 0.99 },
    }

    expect(
      resolvePhaseTwoJevRefinement({
        candidate,
        rankedRecipients,
        recipientEvidence: {},
        answers: {
          ...baseAnswers,
          recipient: {
            type: 'choice',
            choice: 'recipient_0',
            probabilities: { recipient_0: 0.99, recipient_none: 0.01 },
          },
          recipientEvidence: {
            type: 'choice',
            choice: 'evidence_none',
            probabilities: { evidence_none: 0.99 },
          },
        },
      }),
    ).toBeNull()
    expect(
      resolvePhaseTwoJevRefinement({
        candidate,
        rankedRecipients,
        recipientEvidence: {},
        answers: {
          ...baseAnswers,
          recipient: {
            type: 'choice',
            choice: 'recipient_none',
            probabilities: { recipient_0: 0.01, recipient_none: 0.99 },
          },
        },
      }),
    ).toBeNull()
  })
})
