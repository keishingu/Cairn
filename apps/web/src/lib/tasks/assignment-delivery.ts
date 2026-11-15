// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 待機中のイベントの担当やアクセス権が変わっていないか配送直前に確認する。
export async function canDeliverTaskAssignment(workspaceId: string, taskId: string, assigneeId: string) {
  const { db, tasks } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')
  const [task] = await db.select({ projectId: tasks.projectId, channelId: tasks.channelId })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId), eq(tasks.assigneeId, assigneeId)))
    .limit(1)
  if (!task) return false
  const { isAssignableTaskMember } = await import('./assignment-notification')
  return isAssignableTaskMember(workspaceId, assigneeId, task.projectId, task.channelId)
}
