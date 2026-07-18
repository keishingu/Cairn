// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import {
  activeWorkspaceMembers,
  aiNudges,
  db,
  notifications,
  profiles,
  projectMembers,
  projects,
  tasks,
  type AiNudgeDetector,
} from '@cairn/db'
import { and, eq, inArray, isNotNull, ne, or, sql } from 'drizzle-orm'
import {
  AI_NUDGE_DAILY_LIMIT,
  cooldownTargetKey,
  detectTaskNudges,
  effectiveRecipientAccess,
  reconcileAction,
  startOfJstDay,
  type TaskNudgeCandidate,
} from './rules'

const PHASE_ONE_DETECTORS: AiNudgeDetector[] = ['task_due_soon', 'task_overdue', 'task_stalled']

function concernKey(userId: string, dedupeKey: string): string {
  return `${userId}:${dedupeKey}`
}

function notificationData(candidate: TaskNudgeCandidate, nudgeId: string): Record<string, string> {
  const data: Record<string, string> = {
    nudgeId,
    taskId: candidate.taskId,
    projectId: candidate.projectId,
  }
  if (candidate.channelId) data['channelId'] = candidate.channelId
  return data
}

export async function reconcilePhaseOneAiNudges(now = new Date()) {
  return db.transaction(async (tx) => {
    // Inngest の重複実行や手動実行が重なっても、日次上限と状態遷移を直列化する。
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ai-nudges-heartbeat-phase1'))`)

    const taskRows = await tx
      .select({
        id: tasks.id,
        workspaceId: projects.workspaceId,
        projectId: tasks.projectId,
        channelId: sql<string | null>`(
          select c.id
          from channels c
          where c.project_id = ${tasks.projectId}
            and c.type = 'project'
            and c.milestone_id is null
            and (
              not c.is_private
              or exists (
                select 1
                from channel_members cm
                where cm.channel_id = c.id
                  and cm.user_id = ${tasks.assigneeId}
              )
            )
          order by c.created_at asc
          limit 1
        )`,
        title: tasks.title,
        status: tasks.status,
        assigneeId: tasks.assigneeId,
        dueDate: tasks.dueDate,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .innerJoin(profiles, eq(tasks.assigneeId, profiles.id))
      .innerJoin(
        activeWorkspaceMembers,
        and(
          eq(activeWorkspaceMembers.workspaceId, projects.workspaceId),
          eq(activeWorkspaceMembers.userId, tasks.assigneeId),
        ),
      )
      .leftJoin(
        projectMembers,
        and(
          eq(projectMembers.projectId, tasks.projectId),
          eq(projectMembers.userId, tasks.assigneeId),
        ),
      )
      .where(
        and(
          eq(projects.archived, false),
          eq(profiles.aiNudgesEnabled, true),
          isNotNull(tasks.assigneeId),
          or(ne(activeWorkspaceMembers.role, 'guest'), isNotNull(projectMembers.id)),
        ),
      )

    const candidates = taskRows.flatMap((row) => {
      if (!row.assigneeId) return []
      return detectTaskNudges({ ...row, assigneeId: row.assigneeId }, now)
    })
    const candidateByConcern = new Map(
      candidates.map((candidate) => [concernKey(candidate.userId, candidate.dedupeKey), candidate]),
    )

    const existing = await tx
      .select({
        id: aiNudges.id,
        workspaceId: aiNudges.workspaceId,
        userId: aiNudges.userId,
        detector: aiNudges.detector,
        dedupeKey: aiNudges.dedupeKey,
        taskId: aiNudges.taskId,
        projectId: aiNudges.projectId,
        messageId: aiNudges.messageId,
        status: aiNudges.status,
        remindAfter: aiNudges.remindAfter,
        createdAt: aiNudges.createdAt,
        profileEnabled: profiles.aiNudgesEnabled,
        recipientCanAccess: sql<boolean>`public.user_can_access_ai_nudge(
          ${aiNudges.userId},
          ${aiNudges.workspaceId},
          ${aiNudges.channelId},
          ${aiNudges.projectId}
        )`,
      })
      .from(aiNudges)
      .innerJoin(profiles, eq(aiNudges.userId, profiles.id))
      .where(inArray(aiNudges.detector, PHASE_ONE_DETECTORS))

    const dayStart = startOfJstDay(now)
    const deliveriesToday = new Map<string, number>()
    for (const row of existing) {
      if (row.createdAt >= dayStart) {
        deliveriesToday.set(row.userId, (deliveriesToday.get(row.userId) ?? 0) + 1)
      }
    }

    const activeCooldowns = new Set<string>()
    for (const row of existing) {
      if (row.status !== 'suppressed' || !row.remindAfter || row.remindAfter <= now) continue
      const key = cooldownTargetKey(row)
      if (key) activeCooldowns.add(key)
    }

    let resolved = 0
    let suppressed = 0
    let reactivated = 0
    let created = 0

    for (const row of existing) {
      const candidate = candidateByConcern.get(concernKey(row.userId, row.dedupeKey))
      // candidateは現在アクセス可能なtask/project/channelからだけ生成されるため、
      // 保存済みの古い導線より現在candidateの到達可能性を優先する。
      const recipientCanAccess = effectiveRecipientAccess({
        profileEnabled: row.profileEnabled,
        storedRecipientCanAccess: row.recipientCanAccess,
        currentCandidateAccessible: candidate !== undefined,
      })
      const action = reconcileAction({
        status: row.status,
        remindAfter: row.remindAfter,
        conditionContinues: candidate !== undefined,
        recipientCanAccess,
        now,
      })

      if (action === 'resolve') {
        await tx.update(aiNudges).set({ status: 'resolved' }).where(eq(aiNudges.id, row.id))
        resolved += 1
      } else if (action === 'suppress') {
        await tx
          .update(aiNudges)
          .set({ status: 'suppressed', remindAfter: null })
          .where(eq(aiNudges.id, row.id))
        suppressed += 1
      } else if (action === 'reactivate' && candidate) {
        const delivered = deliveriesToday.get(row.userId) ?? 0
        const cooldownKey = cooldownTargetKey(row)
        if (delivered >= AI_NUDGE_DAILY_LIMIT || (cooldownKey && activeCooldowns.has(cooldownKey)))
          continue

        await tx
          .update(aiNudges)
          .set({
            status: 'active',
            channelId: candidate.channelId,
            projectId: candidate.projectId,
            taskId: candidate.taskId,
            feedback: null,
            remindAfter: null,
            respondedAt: null,
            createdAt: now,
            title: candidate.title,
            body: candidate.body,
            reason: candidate.reason,
          })
          .where(eq(aiNudges.id, row.id))
        await tx.insert(notifications).values({
          userId: candidate.userId,
          workspaceId: candidate.workspaceId,
          type: 'ai',
          title: candidate.title,
          body: candidate.body,
          data: notificationData(candidate, row.id),
        })
        deliveriesToday.set(row.userId, delivered + 1)
        reactivated += 1
      }
    }

    const existingConcernKeys = new Set(
      existing.map((row) => concernKey(row.userId, row.dedupeKey)),
    )
    const detectorPriority: Record<TaskNudgeCandidate['detector'], number> = {
      task_overdue: 0,
      task_due_soon: 1,
      task_stalled: 2,
    }

    for (const candidate of candidates.sort(
      (a, b) => detectorPriority[a.detector] - detectorPriority[b.detector],
    )) {
      const key = concernKey(candidate.userId, candidate.dedupeKey)
      if (existingConcernKeys.has(key)) continue
      const cooldownKey = cooldownTargetKey(candidate)
      if (cooldownKey && activeCooldowns.has(cooldownKey)) continue

      const delivered = deliveriesToday.get(candidate.userId) ?? 0
      if (delivered >= AI_NUDGE_DAILY_LIMIT) continue

      const [inserted] = await tx
        .insert(aiNudges)
        .values({
          workspaceId: candidate.workspaceId,
          userId: candidate.userId,
          channelId: candidate.channelId,
          projectId: candidate.projectId,
          taskId: candidate.taskId,
          detector: candidate.detector,
          dedupeKey: candidate.dedupeKey,
          title: candidate.title,
          body: candidate.body,
          reason: candidate.reason,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: aiNudges.id })

      if (!inserted) continue
      await tx.insert(notifications).values({
        userId: candidate.userId,
        workspaceId: candidate.workspaceId,
        type: 'ai',
        title: candidate.title,
        body: candidate.body,
        data: notificationData(candidate, inserted.id),
      })
      existingConcernKeys.add(key)
      deliveriesToday.set(candidate.userId, delivered + 1)
      created += 1
    }

    return { candidates: candidates.length, created, reactivated, resolved, suppressed }
  })
}
