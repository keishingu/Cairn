// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod'

export const JEV_MODEL = 'typesafe-ai/jev'

export interface JevBooleanQuestion {
  type: 'boolean'
  instructions: string
  criteria?: { true: string; false: string }
}

export interface JevChoiceQuestion {
  type: 'choice'
  instructions: string
  criteria: Record<string, string>
}

export type JevQuestion = JevBooleanQuestion | JevChoiceQuestion

const jevBooleanAnswerSchema = z.object({
  type: z.literal('boolean'),
  probability: z.number().min(0).max(1),
})

const jevChoiceAnswerSchema = z.object({
  type: z.literal('choice'),
  choice: z.string(),
  probabilities: z.record(z.number().min(0).max(1)),
})

const jevEvaluationSchema = z.object({
  model: z.string(),
  answers: z.record(z.union([jevBooleanAnswerSchema, jevChoiceAnswerSchema])),
  usage: z
    .object({
      inputTokens: z.number().int().nonnegative().optional(),
      outputTokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
})

export type JevAnswer = z.infer<typeof jevEvaluationSchema>['answers'][string]

export interface JevEvaluationResult {
  answers: Record<string, JevAnswer>
  usage: { inputTokens: number; outputTokens: number }
}

export function resolveAiGatewayToken(
  env: { AI_GATEWAY_API_KEY?: string; VERCEL_OIDC_TOKEN?: string } = process.env as {
    AI_GATEWAY_API_KEY?: string
    VERCEL_OIDC_TOKEN?: string
  },
): string {
  const token = env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN
  if (!token) {
    throw new Error('AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN is not configured')
  }
  return token
}

export async function evaluateWithJev(input: {
  state: unknown
  questions: Record<string, JevQuestion>
}): Promise<JevEvaluationResult> {
  const response = await fetch('https://ai-gateway.vercel.sh/v1/evaluate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resolveAiGatewayToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: JEV_MODEL,
      state: input.state,
      questions: input.questions,
      providerOptions: {
        gateway: {
          zeroDataRetention: true,
          only: ['typesafe-ai'],
        },
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Jev evaluation failed with status ${response.status}`)
  }

  const result = jevEvaluationSchema.parse(await response.json())
  return {
    answers: result.answers,
    usage: {
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
    },
  }
}
