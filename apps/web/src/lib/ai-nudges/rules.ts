// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { AiNudgeDetector, AiNudgeStatus } from '@cairn/db'

export const AI_NUDGE_DAILY_LIMIT = 3
export const DUE_SOON_DAYS = 3
export const STALLED_DAYS = 7

export interface TaskRuleInput {
  id: string
  workspaceId: string
  projectId: string
  channelId: string | null
  title: string
  status: 'todo' | 'in_progress' | 'done'
  assigneeId: string
  dueDate: string | null
  updatedAt: Date
}

export interface TaskNudgeCandidate {
  workspaceId: string
  userId: string
  channelId: string | null
  projectId: string
  taskId: string
  detector: Extract<AiNudgeDetector, 'task_due_soon' | 'task_overdue' | 'task_stalled'>
  dedupeKey: string
  title: string
  body: string
  reason: Record<string, unknown>
}

const JST_TIME_ZONE = 'Asia/Tokyo'

export function dateInJst(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: JST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function startOfJstDay(now: Date): Date {
  return new Date(`${dateInJst(now)}T00:00:00+09:00`)
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

// ISO week-year を使う。年末年始でも同じ週に異なる key が立たないよう、暦年ではなく
// ISO week-year と週番号の組にする。
export function heartbeatWeekKey(now: Date): string {
  const today = dateInJst(now)
  const date = new Date(`${today}T00:00:00Z`)
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const weekYear = date.getUTCFullYear()
  const yearStart = new Date(Date.UTC(weekYear, 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${weekYear}-W${String(week).padStart(2, '0')}`
}

export function detectTaskNudges(task: TaskRuleInput, now: Date): TaskNudgeCandidate[] {
  const today = dateInJst(now)
  const candidates: TaskNudgeCandidate[] = []

  if (
    task.dueDate &&
    task.status === 'todo' &&
    task.dueDate >= today &&
    task.dueDate <= addDays(today, DUE_SOON_DAYS)
  ) {
    candidates.push({
      workspaceId: task.workspaceId,
      userId: task.assigneeId,
      channelId: task.channelId,
      projectId: task.projectId,
      taskId: task.id,
      detector: 'task_due_soon',
      dedupeKey: `task_due_soon:${task.id}:${task.dueDate}`,
      title: 'タスクの期限が近づいています',
      body: `タスク「${task.title}」の期限は${task.dueDate}です。まだ着手されていないようです。`,
      reason: {
        taskId: task.id,
        status: task.status,
        dueDate: task.dueDate,
        detectedAt: now.toISOString(),
        thresholdDays: DUE_SOON_DAYS,
      },
    })
  }

  // due_soon の下限を today に固定し、期限超過時は必ずこちらだけが発火する。
  if (task.dueDate && task.dueDate < today && task.status !== 'done') {
    candidates.push({
      workspaceId: task.workspaceId,
      userId: task.assigneeId,
      channelId: task.channelId,
      projectId: task.projectId,
      taskId: task.id,
      detector: 'task_overdue',
      dedupeKey: `task_overdue:${task.id}:${task.dueDate}`,
      title: 'タスクの期限を過ぎています',
      body: `タスク「${task.title}」は期限（${task.dueDate}）を過ぎています。状況を確認してみましょう。`,
      reason: {
        taskId: task.id,
        status: task.status,
        dueDate: task.dueDate,
        detectedAt: now.toISOString(),
      },
    })
  }

  if (
    task.status === 'in_progress' &&
    task.updatedAt.getTime() < now.getTime() - STALLED_DAYS * 86_400_000
  ) {
    const week = heartbeatWeekKey(now)
    candidates.push({
      workspaceId: task.workspaceId,
      userId: task.assigneeId,
      channelId: task.channelId,
      projectId: task.projectId,
      taskId: task.id,
      detector: 'task_stalled',
      dedupeKey: `task_stalled:${task.id}:${week}`,
      title: 'タスクの更新が止まっています',
      body: `タスク「${task.title}」は7日以上更新されていません。進み具合を確認してみましょう。`,
      reason: {
        taskId: task.id,
        status: task.status,
        updatedAt: task.updatedAt.toISOString(),
        detectedAt: now.toISOString(),
        heartbeatWeek: week,
        thresholdDays: STALLED_DAYS,
      },
    })
  }

  return candidates
}

export type ReconcileAction = 'keep' | 'resolve' | 'suppress' | 'reactivate'

export function effectiveRecipientAccess(input: {
  profileEnabled: boolean
  storedRecipientCanAccess: boolean
  currentCandidateAccessible: boolean
}): boolean {
  return input.profileEnabled && (input.currentCandidateAccessible || input.storedRecipientCanAccess)
}

export function isNudgeCooldownActive(input: {
  status: AiNudgeStatus
  remindAfter: Date | null
  now: Date
}): boolean {
  return (
    (input.status === 'dismissed' || input.status === 'suppressed') &&
    input.remindAfter !== null &&
    input.remindAfter.getTime() > input.now.getTime()
  )
}

export function reconcileAction(input: {
  status: AiNudgeStatus
  remindAfter: Date | null
  conditionContinues: boolean
  recipientCanAccess: boolean
  now: Date
}): ReconcileAction {
  const { status, remindAfter, conditionContinues, recipientCanAccess, now } = input

  if (!recipientCanAccess) {
    return status === 'active' || status === 'dismissed' ? 'suppress' : 'keep'
  }
  if (status === 'resolved') return 'keep'
  if (status === 'active') return conditionContinues ? 'keep' : 'resolve'

  // remindAfter = null の suppressed はキルスイッチまたはアクセス失効による無期限抑止。
  // recipientCanAccess が再び true になった時点で抑止理由が解消したため、次のheartbeatで戻す。
  const cooldownReached = remindAfter === null || remindAfter.getTime() <= now.getTime()
  if (!cooldownReached) return 'keep'
  return conditionContinues ? 'reactivate' : 'resolve'
}

export function cooldownTargetKey(input: {
  userId: string
  detector: AiNudgeDetector
  taskId: string | null
  messageId?: string | null
}): string | null {
  const target = input.taskId
    ? `task:${input.taskId}`
    : input.messageId
      ? `message:${input.messageId}`
      : null
  return target ? `${input.userId}:${input.detector}:${target}` : null
}
