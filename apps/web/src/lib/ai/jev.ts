// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { getVercelOidcToken } from '@vercel/oidc'
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
  providerMetadata: z.record(z.unknown()).optional(),
})

export type JevAnswer = z.infer<typeof jevEvaluationSchema>['answers'][string]

export interface JevEvaluationResult {
  answers: Record<string, JevAnswer>
  usage: { inputTokens: number; outputTokens: number }
  durationMs: number
  authentication: 'api-key' | 'oidc'
  costUsd: number | null
}

export interface JevEvaluationInput {
  state: unknown
  questions: Record<string, JevQuestion>
}

export async function resolveAiGatewayAuth(
  env: { AI_GATEWAY_API_KEY?: string } = process.env as { AI_GATEWAY_API_KEY?: string },
  getOidcToken: () => Promise<string> = getVercelOidcToken,
): Promise<{ token: string; method: 'api-key' | 'oidc' }> {
  if (env.AI_GATEWAY_API_KEY) return { token: env.AI_GATEWAY_API_KEY, method: 'api-key' }
  try {
    return { token: await getOidcToken(), method: 'oidc' }
  } catch {
    throw new Error('AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN is not configured')
  }
}

export async function resolveAiGatewayToken(
  env?: { AI_GATEWAY_API_KEY?: string },
  getOidcToken?: () => Promise<string>,
): Promise<string> {
  return (await resolveAiGatewayAuth(env, getOidcToken)).token
}

function gatewayCostUsd(metadata: Record<string, unknown> | undefined): number | null {
  const gateway = metadata?.['gateway']
  if (!gateway || typeof gateway !== 'object') return null
  const cost = (gateway as Record<string, unknown>)['cost']
  return typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? cost : null
}

function jevEvaluationRequestBody(input: JevEvaluationInput) {
  return {
    model: JEV_MODEL,
    state: input.state,
    questions: input.questions,
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
        only: ['typesafe-ai'],
      },
    },
  }
}

export function jevEvaluationRequestByteLength(input: JevEvaluationInput): number {
  return new TextEncoder().encode(JSON.stringify(jevEvaluationRequestBody(input))).byteLength
}

export async function evaluateWithJev(input: JevEvaluationInput): Promise<JevEvaluationResult> {
  const auth = await resolveAiGatewayAuth()
  const startedAt = performance.now()
  const response = await fetch('https://ai-gateway.vercel.sh/v1/evaluate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(jevEvaluationRequestBody(input)),
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
    durationMs: Math.round(performance.now() - startedAt),
    authentication: auth.method,
    costUsd: gatewayCostUsd(result.providerMetadata),
  }
}
