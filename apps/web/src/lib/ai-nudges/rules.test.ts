import { describe, expect, test } from 'vitest'
import {
  cooldownTargetKey,
  detectTaskNudges,
  effectiveRecipientAccess,
  heartbeatWeekKey,
  isNudgeCooldownActive,
  reconcileAction,
  type TaskRuleInput,
} from './rules'

const NOW = new Date('2026-07-18T00:00:00.000Z') // 2026-07-18 09:00 JST

function task(overrides: Partial<TaskRuleInput> = {}): TaskRuleInput {
  return {
    id: 'task-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    channelId: 'channel-1',
    title: '装備リスト確定',
    status: 'todo',
    assigneeId: 'user-1',
    dueDate: '2026-07-21',
    updatedAt: new Date('2026-07-17T00:00:00.000Z'),
    ...overrides,
  }
}

describe('Phase 1 AIナッジのルール検知', () => {
  test('今日から3日後までの未着手タスクだけを期限間近として検知する', () => {
    expect(detectTaskNudges(task(), NOW).map((item) => item.detector)).toEqual(['task_due_soon'])
    expect(detectTaskNudges(task({ dueDate: '2026-07-22' }), NOW)).toEqual([])
    expect(detectTaskNudges(task({ status: 'in_progress' }), NOW)).toEqual([])
  })

  test('期限超過タスクは期限間近と排他になり期限日を含むdedupe keyを使う', () => {
    const result = detectTaskNudges(task({ dueDate: '2026-07-17' }), NOW)
    expect(result).toHaveLength(1)
    expect(result[0]?.detector).toBe('task_overdue')
    expect(result[0]?.dedupeKey).toBe('task_overdue:task-1:2026-07-17')
  })

  test('7日を超えて更新されていない進行中タスクは実行週をdedupe keyに使う', () => {
    const result = detectTaskNudges(
      task({
        status: 'in_progress',
        dueDate: null,
        updatedAt: new Date('2026-07-10T23:59:59.000Z'),
      }),
      NOW,
    )
    expect(result[0]?.detector).toBe('task_stalled')
    expect(result[0]?.dedupeKey).toBe(`task_stalled:task-1:${heartbeatWeekKey(NOW)}`)

    const nextWeek = new Date('2026-07-25T00:00:00.000Z')
    expect(heartbeatWeekKey(nextWeek)).not.toBe(heartbeatWeekKey(NOW))
  })
})

describe('AIナッジの状態リコンサイル', () => {
  test('未来のremindAfterを持つlaterとnot_helpfulはdedupe keyを跨いでもクールダウン中とする', () => {
    const remindAfter = new Date(NOW.getTime() + 1)
    expect(isNudgeCooldownActive({ status: 'dismissed', remindAfter, now: NOW })).toBe(true)
    expect(isNudgeCooldownActive({ status: 'suppressed', remindAfter, now: NOW })).toBe(true)
    expect(isNudgeCooldownActive({ status: 'dismissed', remindAfter: NOW, now: NOW })).toBe(false)
    expect(isNudgeCooldownActive({ status: 'active', remindAfter, now: NOW })).toBe(false)
  })

  test('保存済み導線が失効していても現在candidateへ到達できればアクセス可能とする', () => {
    expect(
      effectiveRecipientAccess({
        profileEnabled: true,
        storedRecipientCanAccess: false,
        currentCandidateAccessible: true,
      }),
    ).toBe(true)
    expect(
      effectiveRecipientAccess({
        profileEnabled: false,
        storedRecipientCanAccess: true,
        currentCandidateAccessible: true,
      }),
    ).toBe(false)
  })

  test('activeの条件が解消したらresolvedにする', () => {
    expect(
      reconcileAction({
        status: 'active',
        remindAfter: null,
        conditionContinues: false,
        recipientCanAccess: true,
        now: NOW,
      }),
    ).toBe('resolve')
  })

  test('抑止期限の到来前は状態を維持し、到来後に条件継続なら再active化する', () => {
    expect(
      reconcileAction({
        status: 'dismissed',
        remindAfter: new Date(NOW.getTime() + 1),
        conditionContinues: true,
        recipientCanAccess: true,
        now: NOW,
      }),
    ).toBe('keep')
    expect(
      reconcileAction({
        status: 'suppressed',
        remindAfter: NOW,
        conditionContinues: true,
        recipientCanAccess: true,
        now: NOW,
      }),
    ).toBe('reactivate')
  })

  test('キルスイッチ再ON後は無期限抑止の条件が継続していれば再active化する', () => {
    expect(
      reconcileAction({
        status: 'suppressed',
        remindAfter: null,
        conditionContinues: true,
        recipientCanAccess: true,
        now: NOW,
      }),
    ).toBe('reactivate')
  })

  test('アクセスを失ったactiveまたはdismissedナッジはsuppressedにする', () => {
    expect(
      reconcileAction({
        status: 'active',
        remindAfter: null,
        conditionContinues: true,
        recipientCanAccess: false,
        now: NOW,
      }),
    ).toBe('suppress')
    expect(
      reconcileAction({
        status: 'dismissed',
        remindAfter: null,
        conditionContinues: true,
        recipientCanAccess: false,
        now: NOW,
      }),
    ).toBe('suppress')
  })

  test('横断クールダウンはdedupe keyではなくユーザー・検知器・対象で同定する', () => {
    expect(
      cooldownTargetKey({ userId: 'user-1', detector: 'task_stalled', taskId: 'task-1' }),
    ).toBe('user-1:task_stalled:task:task-1')
  })
})
