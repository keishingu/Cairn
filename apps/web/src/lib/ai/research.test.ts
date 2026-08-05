// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import {
  AI_RESEARCH_LIMITS,
  clampResearchLimit,
  detectProjectDeadlineRisk,
  detectResearchTaskRisks,
  isResearchTruncated,
  type ResearchTaskInput,
} from './research'

const NOW = new Date('2026-08-05T00:00:00.000Z') // 2026-08-05 09:00 JST

function task(overrides: Partial<ResearchTaskInput> = {}): ResearchTaskInput {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    projectId: '20000000-0000-4000-8000-000000000001',
    title: '調査タスク',
    status: 'todo',
    priority: 'medium',
    assigneeId: '30000000-0000-4000-8000-000000000001',
    dueDate: null,
    updatedAt: NOW,
    ...overrides,
  }
}

describe('AI横断調査の構造化リスク判定', () => {
  test('期限超過の未完了タスクを検知する', () => {
    const result = detectResearchTaskRisks(task({ dueDate: '2026-08-04' }), NOW)
    expect(result.map((risk) => risk.type)).toContain('task_overdue')
  })

  test('3日以内が期限の未着手タスクを検知する', () => {
    const result = detectResearchTaskRisks(task({ dueDate: '2026-08-08' }), NOW)
    expect(result.map((risk) => risk.type)).toEqual(['task_due_soon'])
  })

  test('進行中でちょうど7日更新がないタスクを停滞として検知する', () => {
    const result = detectResearchTaskRisks(
      task({
        status: 'in_progress',
        updatedAt: new Date(NOW.getTime() - 7 * 86_400_000),
      }),
      NOW,
    )
    expect(result.map((risk) => risk.type)).toContain('task_stalled')
  })

  test('担当者未設定の未完了タスクを検知する', () => {
    const result = detectResearchTaskRisks(task({ assigneeId: null }), NOW)
    expect(result.map((risk) => risk.type)).toEqual(['task_unassigned'])
  })

  test('完了タスクは期限超過・停滞・未アサインのいずれにも誤検出しない', () => {
    const result = detectResearchTaskRisks(
      task({
        status: 'done',
        assigneeId: null,
        dueDate: '2026-07-01',
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      }),
      NOW,
    )
    expect(result).toEqual([])
  })

  test('日付境界をJSTで判定する', () => {
    const beforeMidnight = new Date('2026-08-05T14:59:59.999Z')
    const afterMidnight = new Date('2026-08-05T15:00:00.000Z')
    expect(
      detectResearchTaskRisks(task({ dueDate: '2026-08-05' }), beforeMidnight)
        .some((risk) => risk.type === 'task_overdue'),
    ).toBe(false)
    expect(
      detectResearchTaskRisks(task({ dueDate: '2026-08-05' }), afterMidnight)
        .some((risk) => risk.type === 'task_overdue'),
    ).toBe(true)
  })

  test('終了間近で未完了タスクが多いプロジェクトを検知する', () => {
    expect(
      detectProjectDeadlineRisk({
        id: '20000000-0000-4000-8000-000000000001',
        title: '調査プロジェクト',
        endDate: '2026-08-10',
        incompleteTaskCount: 3,
        totalTaskCount: 4,
        archived: false,
        updatedAt: NOW,
        now: NOW,
      })?.type,
    ).toBe('project_deadline_at_risk')
  })
})

describe('AI横断調査の取得上限', () => {
  test('モデルが過大な件数を指定してもサーバー上限へ切り詰める', () => {
    expect(clampResearchLimit(999, AI_RESEARCH_LIMITS.projects)).toBe(50)
    expect(clampResearchLimit(999, AI_RESEARCH_LIMITS.tasks)).toBe(100)
    expect(clampResearchLimit(999, AI_RESEARCH_LIMITS.messages)).toBe(100)
    expect(clampResearchLimit(999, AI_RESEARCH_LIMITS.documents)).toBe(10)
    expect(clampResearchLimit(999, AI_RESEARCH_LIMITS.messageLookbackMaxDays)).toBe(90)
  })

  test('tool callingは最大8ステップに固定する', () => {
    expect(AI_RESEARCH_LIMITS.toolSteps).toBe(8)
  })

  test('上限超過と本文切り詰めをtruncatedとして返す', () => {
    expect(isResearchTruncated(101, 100)).toBe(true)
    expect(isResearchTruncated(1, 1, true)).toBe(true)
    expect(isResearchTruncated(1, 1)).toBe(false)
  })
})
