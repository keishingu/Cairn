import { describe, expect, test } from 'vitest'
import {
  isQuietHoursInJst,
  isPhaseTwoDetector,
  isUnansweredAskRecheckDue,
  isUnansweredAskEligible,
  nextUnansweredAskRecheck,
  nextJstDeliveryTime,
  passesPhaseTwoConfidence,
  phaseTwoDedupeKey,
  shouldResolveDueLlmRiskReminder,
} from './llm-nudge-rules'

describe('Phase 2 AIナッジの決定論的な発話ゲート', () => {
  test('確信度0.85以上だけを通す', () => {
    expect(passesPhaseTwoConfidence(0.849)).toBe(false)
    expect(passesPhaseTwoConfidence(0.85)).toBe(true)
    expect(passesPhaseTwoConfidence(Number.NaN)).toBe(false)
  })

  test('Phase 1とPhase 2の検知器を別の頻度枠として識別する', () => {
    expect(isPhaseTwoDetector('unanswered_ask')).toBe(true)
    expect(isPhaseTwoDetector('llm_risk')).toBe(true)
    expect(isPhaseTwoDetector('task_overdue')).toBe(false)
  })

  test('検知器と根拠メッセージでdedupe keyを作る', () => {
    expect(phaseTwoDedupeKey('unanswered_ask', 'message-1')).toBe('unanswered_ask:message-1')
    expect(phaseTwoDedupeKey('llm_risk', 'message-2')).toBe('llm_risk:message-2')
  })

  test('未回答依頼は24時間経過かつ直接返信なしの場合だけ対象にする', () => {
    const now = new Date('2026-07-19T00:00:00.000Z')
    expect(
      isUnansweredAskEligible({
        messageCreatedAt: new Date('2026-07-18T00:00:00.000Z'),
        hasDirectReply: false,
        now,
      }),
    ).toBe(true)
    expect(
      isUnansweredAskEligible({
        messageCreatedAt: new Date('2026-07-18T00:00:00.000Z'),
        hasDirectReply: true,
        now,
      }),
    ).toBe(false)
  })

  test('24時間未満で巡回した依頼は、最も早い成熟時刻に再評価を予約する', () => {
    const now = new Date('2026-07-19T00:00:00.000Z')
    expect(
      nextUnansweredAskRecheck({
        messages: [
          { id: 'second', createdAt: new Date('2026-07-18T20:00:00.000Z') },
          { id: 'third', createdAt: new Date('2026-07-18T23:00:00.000Z') },
        ],
        existing: { messageId: 'first', checkAt: new Date('2026-07-19T01:00:00.000Z') },
        now,
      }),
    ).toEqual({ messageId: 'first', checkAt: new Date('2026-07-19T01:00:00.000Z') })
  })

  test('成熟後の未回答依頼は新着の有無にかかわらず再評価対象にする', () => {
    const now = new Date('2026-07-19T00:00:00.000Z')
    expect(isUnansweredAskRecheckDue(new Date('2026-07-18T23:59:59.999Z'), now)).toBe(true)
    expect(isUnansweredAskRecheckDue(new Date('2026-07-19T00:00:00.001Z'), now)).toBe(false)
  })

  test('再評価の100件窓を越えた成熟済みメッセージは即時に続行予約する', () => {
    const now = new Date('2026-07-19T00:00:00.000Z')
    expect(
      nextUnansweredAskRecheck({
        messages: [{ id: 'next', createdAt: new Date('2026-07-17T00:00:00.000Z') }],
        existing: null,
        now,
        includeOverdue: true,
      }),
    ).toEqual({ messageId: 'next', checkAt: now })
  })

  test('会話が進んだリスクの期限到来時は、再評価できなければ古いナッジを解消する', () => {
    expect(
      shouldResolveDueLlmRiskReminder({
        hasNewerMessage: true,
        sourceEvaluated: false,
        proposedAgain: false,
      }),
    ).toBe(true)
    expect(
      shouldResolveDueLlmRiskReminder({
        hasNewerMessage: true,
        sourceEvaluated: true,
        proposedAgain: true,
      }),
    ).toBe(false)
  })

  test('22〜08時JSTを静寂時間帯とし次の08時まで遅延する', () => {
    const twoAmJst = new Date('2026-07-18T17:00:00.000Z')
    const elevenPmJst = new Date('2026-07-19T14:00:00.000Z')
    const eightAmJst = new Date('2026-07-18T23:00:00.000Z')
    expect(isQuietHoursInJst(twoAmJst)).toBe(true)
    expect(isQuietHoursInJst(eightAmJst)).toBe(false)
    expect(nextJstDeliveryTime(twoAmJst).toISOString()).toBe('2026-07-18T23:00:00.000Z')
    expect(nextJstDeliveryTime(elevenPmJst).toISOString()).toBe('2026-07-19T23:00:00.000Z')
  })
})
