// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { DUE_SOON_DAYS, STALLED_DAYS, dateInJst } from '@/lib/ai-nudges/rules'

export const AI_RESEARCH_LIMITS = {
  projects: 50,
  tasks: 100,
  messages: 100,
  documents: 10,
  messageLookbackDefaultDays: 30,
  messageLookbackMaxDays: 90,
  toolSteps: 8,
  risks: 100,
  projectEndSoonDays: 7,
  projectIncompleteTaskThreshold: 3,
  messageContentChars: 2_000,
  documentContentChars: 6_000,
} as const

export function clampResearchLimit(requested: number | undefined, maximum: number): number {
  if (!Number.isFinite(requested)) return maximum
  return Math.max(1, Math.min(Math.floor(requested ?? maximum), maximum))
}

export function isResearchTruncated(
  totalCount: number,
  returnedCount: number,
  contentTruncated = false,
): boolean {
  return totalCount > returnedCount || contentTruncated
}

export type ResearchEvidenceType = 'project' | 'task' | 'message' | 'file' | 'member'

export interface ResearchEvidence {
  type: ResearchEvidenceType
  id: string
  label: string
  projectId?: string
  channelId?: string
  occurredAt?: string
  href: string
}

export function projectEvidence(id: string, label: string, occurredAt?: string): ResearchEvidence {
  return {
    type: 'project',
    id,
    label,
    ...(occurredAt ? { occurredAt } : {}),
    href: `/projects?open=project-${encodeURIComponent(id)}`,
  }
}

export function taskEvidence(input: {
  id: string
  label: string
  projectId: string
  occurredAt?: string
}): ResearchEvidence {
  return {
    type: 'task',
    id: input.id,
    label: input.label,
    projectId: input.projectId,
    ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    href: `/tasks?taskId=${encodeURIComponent(input.id)}`,
  }
}

export function messageEvidence(input: {
  id: string
  label: string
  channelId: string
  projectId?: string | null
  occurredAt: string
}): ResearchEvidence {
  return {
    type: 'message',
    id: input.id,
    label: input.label,
    channelId: input.channelId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    occurredAt: input.occurredAt,
    href: `/chats/${encodeURIComponent(input.channelId)}?m=${encodeURIComponent(input.id)}`,
  }
}

export type ResearchRiskType =
  | 'task_overdue'
  | 'task_due_soon'
  | 'task_stalled'
  | 'task_unassigned'
  | 'project_deadline_at_risk'

export type ResearchRiskSeverity = 'critical' | 'high' | 'medium'

export interface ResearchRisk {
  type: ResearchRiskType
  severity: ResearchRiskSeverity
  projectId: string
  taskId?: string
  reason: string
  facts: Record<string, string | number | null>
  evidence: ResearchEvidence[]
}

export interface ResearchTaskInput {
  id: string
  projectId: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
  priority: 'high' | 'medium' | 'low'
  assigneeId: string | null
  dueDate: string | null
  updatedAt: Date
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) /
      86_400_000,
  )
}

export function detectResearchTaskRisks(task: ResearchTaskInput, now: Date): ResearchRisk[] {
  if (task.status === 'done') return []

  const today = dateInJst(now)
  const evidence = [
    taskEvidence({
      id: task.id,
      label: task.title,
      projectId: task.projectId,
      occurredAt: task.updatedAt.toISOString(),
    }),
  ]
  const risks: ResearchRisk[] = []

  if (task.dueDate && task.dueDate < today) {
    const overdueDays = daysBetween(task.dueDate, today)
    risks.push({
      type: 'task_overdue',
      severity: overdueDays >= 7 ? 'critical' : 'high',
      projectId: task.projectId,
      taskId: task.id,
      reason: `未完了のまま期限を${overdueDays}日過ぎています`,
      facts: { status: task.status, dueDate: task.dueDate, overdueDays },
      evidence,
    })
  } else if (
    task.dueDate &&
    task.status === 'todo' &&
    task.dueDate <= addDays(today, DUE_SOON_DAYS)
  ) {
    const daysUntilDue = daysBetween(today, task.dueDate)
    risks.push({
      type: 'task_due_soon',
      severity: daysUntilDue <= 1 ? 'high' : 'medium',
      projectId: task.projectId,
      taskId: task.id,
      reason: `未着手のまま期限まで${daysUntilDue}日です`,
      facts: { status: task.status, dueDate: task.dueDate, daysUntilDue },
      evidence,
    })
  }

  if (
    task.status === 'in_progress' &&
    task.updatedAt.getTime() <= now.getTime() - STALLED_DAYS * 86_400_000
  ) {
    const stalledDays = Math.floor((now.getTime() - task.updatedAt.getTime()) / 86_400_000)
    risks.push({
      type: 'task_stalled',
      severity: stalledDays >= 14 ? 'high' : 'medium',
      projectId: task.projectId,
      taskId: task.id,
      reason: `進行中のまま${stalledDays}日更新されていません`,
      facts: { status: task.status, updatedAt: task.updatedAt.toISOString(), stalledDays },
      evidence,
    })
  }

  if (!task.assigneeId) {
    const urgent = task.priority === 'high' || !!risks.find((risk) =>
      risk.type === 'task_overdue' || risk.type === 'task_due_soon',
    )
    risks.push({
      type: 'task_unassigned',
      severity: urgent ? 'high' : 'medium',
      projectId: task.projectId,
      taskId: task.id,
      reason: '未完了ですが担当者が設定されていません',
      facts: { status: task.status, priority: task.priority, assigneeId: null },
      evidence,
    })
  }

  return risks
}

export function detectProjectDeadlineRisk(input: {
  id: string
  title: string
  endDate: string | null
  incompleteTaskCount: number
  totalTaskCount: number
  archived: boolean
  updatedAt: Date
  now: Date
}): ResearchRisk | null {
  if (input.archived || !input.endDate) return null
  const today = dateInJst(input.now)
  if (input.endDate < today || input.endDate > addDays(today, AI_RESEARCH_LIMITS.projectEndSoonDays)) {
    return null
  }
  if (input.incompleteTaskCount < AI_RESEARCH_LIMITS.projectIncompleteTaskThreshold) return null

  const daysUntilEnd = daysBetween(today, input.endDate)
  return {
    type: 'project_deadline_at_risk',
    severity: daysUntilEnd <= 3 ? 'high' : 'medium',
    projectId: input.id,
    reason: `終了日まで${daysUntilEnd}日ですが未完了タスクが${input.incompleteTaskCount}件あります`,
    facts: {
      endDate: input.endDate,
      daysUntilEnd,
      incompleteTaskCount: input.incompleteTaskCount,
      totalTaskCount: input.totalTaskCount,
    },
    evidence: [projectEvidence(input.id, input.title, input.updatedAt.toISOString())],
  }
}

const SEVERITY_RANK: Record<ResearchRiskSeverity, number> = { critical: 0, high: 1, medium: 2 }

export function sortResearchRisks(risks: ResearchRisk[]): ResearchRisk[] {
  return [...risks].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}
