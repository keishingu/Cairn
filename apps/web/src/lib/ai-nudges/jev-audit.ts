// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { auditLogs, db } from '@cairn/db'
import type { JevAnswer, JevEvaluationResult } from '@/lib/ai/jev'

export type JevDecisionOutcome = 'passed' | 'below_threshold' | 'ignore' | 'invalid'

export interface JevDecisionSummary {
  selectedLabel: string | null
  probabilities: Record<string, number>
  selectedProbability: number | null
  outcome: JevDecisionOutcome
}

export function summarizeJevDecision(
  answer: JevAnswer | undefined,
  threshold: number,
  acceptedLabels?: string[],
): JevDecisionSummary {
  if (!answer) {
    return { selectedLabel: null, probabilities: {}, selectedProbability: null, outcome: 'invalid' }
  }
  if (answer.type === 'boolean') {
    const selectedLabel = answer.probability >= 0.5 ? 'true' : 'false'
    return {
      selectedLabel,
      probabilities: { true: answer.probability, false: 1 - answer.probability },
      selectedProbability:
        selectedLabel === 'true' ? answer.probability : 1 - answer.probability,
      outcome:
        selectedLabel === 'false'
          ? 'ignore'
          : answer.probability >= threshold
            ? 'passed'
            : 'below_threshold',
    }
  }
  const selectedProbability = answer.probabilities[answer.choice] ?? null
  const accepted = acceptedLabels
    ? acceptedLabels.includes(answer.choice)
    : answer.choice !== 'ignore'
  return {
    selectedLabel: answer.choice,
    probabilities: answer.probabilities,
    selectedProbability,
    outcome: !accepted
      ? 'ignore'
      : selectedProbability !== null && selectedProbability >= threshold
        ? 'passed'
        : 'below_threshold',
  }
}

interface JevAuditDecision {
  questionId: string
  messageId: string
  answer: JevAnswer | undefined
  threshold: number
  selectedUserId?: string | null
  acceptedLabels?: string[]
}

export async function recordPhaseTwoJevAudit(input: {
  workspaceId: string
  channelId: string
  stage: 'screen' | 'refine'
  evaluation: JevEvaluationResult
  decisions: JevAuditDecision[]
}): Promise<void> {
  const evaluationId = crypto.randomUUID()
  try {
    await db.insert(auditLogs).values([
      {
        workspaceId: input.workspaceId,
        entityType: 'ai_pmo_channel',
        entityId: input.channelId,
        action: 'jev_request_completed',
        payload: {
          version: 1,
          evaluationId,
          channelId: input.channelId,
          stage: input.stage,
          model: 'typesafe-ai/jev',
          durationMs: input.evaluation.durationMs,
          inputTokens: input.evaluation.usage.inputTokens,
          outputTokens: input.evaluation.usage.outputTokens,
          costUsd: input.evaluation.costUsd,
          authentication: input.evaluation.authentication,
          vercelEnvironment: process.env['VERCEL_ENV'] ?? 'local',
          gitBranch: process.env['VERCEL_GIT_COMMIT_REF'] ?? null,
          createdAt: new Date().toISOString(),
        },
      },
      ...input.decisions.map((decision) => ({
        workspaceId: input.workspaceId,
        userId: decision.selectedUserId ?? null,
        entityType: 'ai_pmo_message',
        entityId: decision.messageId,
        action: `jev_${input.stage}_decision`,
        payload: {
          version: 1,
          evaluationId,
          channelId: input.channelId,
          questionId: decision.questionId,
          stage: input.stage,
          model: 'typesafe-ai/jev',
          threshold: decision.threshold,
          ...summarizeJevDecision(
            decision.answer,
            decision.threshold,
            decision.acceptedLabels,
          ),
          createdAt: new Date().toISOString(),
        },
      })),
    ])
  } catch (error) {
    // Jev成功後の記録失敗で外部APIを再実行すると二重課金になるため、判定処理は継続する。
    console.error('[ai-nudges] Jev decision audit recording failed:', error)
  }
}
