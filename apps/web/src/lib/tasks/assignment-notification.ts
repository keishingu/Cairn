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
        assignerName: assigner?.displayName ?? '不明',
      },
    } satisfies TaskAssignedEvent)
  } catch (e) {
    console.warn('[notifyTaskAssigned] Inngest event send failed (notification skipped):', e)
  }
}

// 指定ユーザーが当該ワークスペースの active メンバーかを検証する。
// 担当者に設定できるのは active メンバーのみ（非活性・非メンバーは弾く）。
export async function isActiveWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  const { db, activeWorkspaceMembers } = await import('@cairn/db')
  const { eq, and } = await import('drizzle-orm')
  const [row] = await db
    .select({ userId: activeWorkspaceMembers.userId })
    .from(activeWorkspaceMembers)
    .where(and(
      eq(activeWorkspaceMembers.workspaceId, workspaceId),
      eq(activeWorkspaceMembers.userId, userId),
    ))
    .limit(1)
  return !!row
}

// プロジェクト未所属タスクの担当者に設定できるかを検証する。
// 未所属タスクは guest には閲覧も操作もできない（GET は guest に null プロジェクトを見せず、
// 編集・削除も member 以上を要求する）ため、guest への割り当ては拒否する。active な member 以上のみ true。
export async function isAssignableToProjectlessTask(workspaceId: string, userId: string): Promise<boolean> {
  const { getWorkspaceRole, isWorkspaceMember } = await import('@/lib/access/membership')
  const role = await getWorkspaceRole(workspaceId, userId)
  return isWorkspaceMember(role)
}
