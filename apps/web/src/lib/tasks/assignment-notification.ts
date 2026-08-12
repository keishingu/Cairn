// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { TaskAssignedEvent } from '@/lib/inngest/events'

// タスクの担当者割り当て通知を送る。作成（POST）と編集（PATCH）で共通利用する。
// 自分自身への割り当ては通知しない。送信失敗は warn ログのみでリクエストは失敗させない。
export async function notifyTaskAssigned(params: {
  workspaceId: string
  assignerId: string
  assigneeId: string
  taskId: string
  taskTitle: string
  projectId: string | null
  projectTitle: string
}): Promise<void> {
  if (params.assigneeId === params.assignerId) return

  try {
    const { db, profiles, workspaceMembers } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')
    const { workspaceMemberDisplayName } = await import('@/lib/workspace-member-display-name')
    const { inngest } = await import('@/lib/inngest/client')

    const [assigner] = await db
      .select({ displayName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName) })
      .from(profiles)
      .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.workspaceId, params.workspaceId)))
      .where(eq(profiles.id, params.assignerId))

    await inngest.send({
      name: 'task/assigned',
      data: {
        taskId: params.taskId,
        taskTitle: params.taskTitle,
        assigneeId: params.assigneeId,
        projectId: params.projectId ?? '',
        projectTitle: params.projectTitle,
        workspaceId: params.workspaceId,
        assignerId: params.assignerId,
        assignerName: assigner?.displayName ?? '不明',
      },
    } satisfies TaskAssignedEvent)
  } catch (e) {
    console.warn('[notifyTaskAssigned] Inngest event send failed (notification skipped):', e)
  }
}

// 指定ユーザーをタスクの担当者に設定できるかを検証する。
// 割り当てられた本人がそのタスクを閲覧・操作できることを担保するため、閲覧範囲と揃える。
// - active な member 以上: 常に可
// - active な guest: プロジェクトタスクなら当該プロジェクトのメンバーの場合のみ可
//   （guest の閲覧は参加プロジェクトに限定され、参加外は requireProjectAccess で編集も弾かれるため）。
//   プロジェクト未所属タスクは guest には見えないため不可
// - 非active・非メンバー: 不可
export async function isAssignableTaskMember(
  workspaceId: string,
  userId: string,
  projectId: string | null,
): Promise<boolean> {
  const { getWorkspaceRole, isWorkspaceMember } = await import('@/lib/access/membership')
  const role = await getWorkspaceRole(workspaceId, userId)
  if (!role) return false
  if (isWorkspaceMember(role)) return true

  // ここに来るのは active な guest のみ。未所属タスクは不可、プロジェクトタスクは参加メンバーのみ。
  if (projectId == null) return false
  const { db, projectMembers } = await import('@cairn/db')
  const { eq, and } = await import('drizzle-orm')
  const [pm] = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1)
  return !!pm
}
