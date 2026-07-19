// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { AiNudgeDetector } from '@cairn/db'

export const PHASE_TWO_CONFIDENCE_THRESHOLD = 0.85
export const PHASE_TWO_DAILY_LIMIT = 3
export const PHASE_TWO_NEW_MESSAGE_LIMIT = 100
export const PHASE_TWO_CONTEXT_MESSAGE_LIMIT = 30
export const UNANSWERED_ASK_MIN_AGE_MS = 24 * 60 * 60 * 1000

export type PhaseTwoDetector = Extract<AiNudgeDetector, 'unanswered_ask' | 'llm_risk'>

export function isPhaseTwoDetector(detector: AiNudgeDetector): detector is PhaseTwoDetector {
  return detector === 'unanswered_ask' || detector === 'llm_risk'
}

export function phaseTwoDedupeKey(detector: PhaseTwoDetector, messageId: string): string {
  return `${detector}:${messageId}`
}

export function passesPhaseTwoConfidence(confidence: number): boolean {
  return Number.isFinite(confidence) && confidence >= PHASE_TWO_CONFIDENCE_THRESHOLD
}

export function isUnansweredAskEligible(input: {
  messageCreatedAt: Date
  hasDirectReply: boolean
  now: Date
}): boolean {
  return (
    !input.hasDirectReply &&
    input.messageCreatedAt.getTime() <= input.now.getTime() - UNANSWERED_ASK_MIN_AGE_MS
  )
}

export function nextUnansweredAskRecheck(input: {
  messages: Array<{ id: string; createdAt: Date }>
  existing: { messageId: string; checkAt: Date } | null
  now: Date
}): { messageId: string; checkAt: Date } | null {
  const futureChecks = [
    ...input.messages.map(({ id, createdAt }) => ({
      messageId: id,
      checkAt: new Date(createdAt.getTime() + UNANSWERED_ASK_MIN_AGE_MS),
    })),
    input.existing,
  ].filter((check): check is { messageId: string; checkAt: Date } =>
    Boolean(check && check.checkAt > input.now),
  )

  if (futureChecks.length === 0) return null
  return futureChecks.sort(
    (a, b) => a.checkAt.getTime() - b.checkAt.getTime() || a.messageId.localeCompare(b.messageId),
  )[0] ?? null
}

export function isUnansweredAskRecheckDue(checkAt: Date | null, now: Date): boolean {
  return checkAt !== null && checkAt <= now
}

export function shouldResolveDueLlmRiskReminder(input: {
  hasNewerMessage: boolean
  sourceEvaluated: boolean
  proposedAgain: boolean
}): boolean {
  return input.hasNewerMessage && (!input.sourceEvaluated || !input.proposedAgain)
}

export function isQuietHoursInJst(now: Date): boolean {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  )
  return hour >= 22 || hour < 8
}

export function nextJstDeliveryTime(now: Date): Date {
  if (!isQuietHoursInJst(now)) return now

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const date = `${values['year']}-${values['month']}-${values['day']}`
  const deliveryDate = new Date(`${date}T08:00:00+09:00`)

  // 22時以降は翌朝、0〜7時台は当日朝に配信する。
  if (Number(values['hour']) >= 22) deliveryDate.setUTCDate(deliveryDate.getUTCDate() + 1)
  return deliveryDate
}
