// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluateWithJev } from '@/lib/ai/jev'
import {
  buildPhaseTwoJevRefineRequest,
  resolvePhaseTwoJevRefinement,
  type PhaseTwoChannelInput,
  type PhaseTwoPrimaryCandidate,
  type PhaseTwoRecipient,
} from './llm-nudge-scan'

interface ShadowCase {
  name: string
  input: PhaseTwoChannelInput
  candidate: PhaseTwoPrimaryCandidate
  rankedRecipients: PhaseTwoRecipient[]
  expectedAccepted: boolean | null
}

const fixturePath = process.env['AI_PMO_JEV_SHADOW_FIXTURE']
const executePaidEvaluation = process.env['AI_PMO_JEV_SHADOW_EXECUTE'] === '1'

function syntheticUnassignedAsk(): ShadowCase {
  const evaluatedAt = '2026-09-21T00:00:00.000Z'
  return {
    name: 'unassigned ask with prior ownership evidence',
    input: {
      channelId: 'shadow-channel',
      workspaceId: 'shadow-workspace',
      projectId: null,
      channelName: 'shadow',
      messages: [
        {
          id: 'ownership',
          senderId: 'operator',
          senderName: '運用担当',
          parentMessageId: null,
          content: '請求フローの運用と障害対応は私が担当しています。',
          createdAt: '2026-09-19T00:00:00.000Z',
          isNew: false,
        },
        {
          id: 'ask',
          senderId: 'asker',
          senderName: '依頼者',
          parentMessageId: null,
          content: '請求処理が止まっています。確認できる方はいますか？',
          createdAt: '2026-09-19T01:00:00.000Z',
          isNew: true,
        },
      ],
      newMessageIds: ['ask'],
      recheckMessageIds: [],
      scannedThroughMessageId: 'ask',
      scannedThroughCreatedAt: '2026-09-19T01:00:00.000Z',
      evaluatedAt,
      hasUnloadedMessagesAfterScanWindow: false,
      isUnansweredAskRecheck: false,
      advancesCursor: true,
      nextUnansweredAskCheckAt: null,
      nextUnansweredAskMessageId: null,
    },
    candidate: {
      detector: 'unanswered_ask',
      sourceMessageId: 'ask',
      observation: '担当が明示されていない未回答の依頼',
      screenConfidence: 0.75,
    },
    rankedRecipients: [
      {
        userId: 'operator',
        displayName: '運用担当',
        role: 'member',
        mentionedInSource: false,
        recentMessageCount: 1,
        relatedTaskCount: 0,
        skills: ['請求運用'],
      },
    ],
    expectedAccepted: true,
  }
}

describe.skipIf(!fixturePath)('Jev二次判定の無副作用shadow比較', () => {
  it('保存例と明確な合成正例を同じ実モデルで評価する', async () => {
    const savedCases = JSON.parse(
      readFileSync(resolve(fixturePath!), 'utf8'),
    ) as ShadowCase[]
    if (!Array.isArray(savedCases) || savedCases.length === 0) {
      throw new Error('AI_PMO_JEV_SHADOW_FIXTURE must contain at least one saved case')
    }
    const cases = [...savedCases, syntheticUnassignedAsk()]
    const preparedCases = cases.map((testCase) => {
      const request = buildPhaseTwoJevRefineRequest(
        testCase.input,
        testCase.candidate,
        testCase.rankedRecipients,
        new Date(testCase.input.evaluatedAt),
      )
      expect(request, `${testCase.name}: incomplete input`).not.toBeNull()
      return { testCase, request: request! }
    })
    const requestSizes = preparedCases.map(({ testCase, request }) => {
      const body = JSON.stringify({ state: request.state, questions: request.questions })
      return { name: testCase.name, characters: body.length, bytes: Buffer.byteLength(body, 'utf8') }
    })
    console.info(
      JSON.stringify(
        {
          phase: executePaidEvaluation ? 'estimate-before-paid-run' : 'dry-run',
          requestCount: preparedCases.length,
          totalCharacters: requestSizes.reduce((total, size) => total + size.characters, 0),
          totalBytes: requestSizes.reduce((total, size) => total + size.bytes, 0),
          largestRequest: requestSizes.reduce((largest, size) =>
            size.bytes > largest.bytes ? size : largest,
          ),
          requestSizes,
          tokenCountAnd32kFit: 'not verified without the real model tokenizer',
        },
        null,
        2,
      ),
    )
    if (!executePaidEvaluation) return

    const results = []
    const failures: string[] = []

    for (const { testCase, request } of preparedCases) {
      try {
        const evaluation = await evaluateWithJev(request)
        const decision = resolvePhaseTwoJevRefinement({
          candidate: testCase.candidate,
          rankedRecipients: testCase.rankedRecipients,
          recipientEvidence: request.recipientEvidence,
          answers: evaluation.answers,
        })
        results.push({
          name: testCase.name,
          expectedAccepted: testCase.expectedAccepted,
          accepted: decision !== null,
          answers: evaluation.answers,
          usage: evaluation.usage,
          durationMs: evaluation.durationMs,
          costUsd: evaluation.costUsd,
          authentication: evaluation.authentication,
        })
        if (
          testCase.expectedAccepted !== null &&
          (decision !== null) !== testCase.expectedAccepted
        ) {
          failures.push(testCase.name)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        results.push({ name: testCase.name, error: message })
        failures.push(testCase.name)
      }
    }

    console.info(
      JSON.stringify(
        {
          requestCount: cases.length,
          requestSizes,
          results,
        },
        null,
        2,
      ),
    )
    expect(failures, '全ケース評価後の不一致またはAPIエラー').toEqual([])
  })
})
