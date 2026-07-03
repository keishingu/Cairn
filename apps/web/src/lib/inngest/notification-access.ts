// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 通知配信の宛先解決も active_workspace_members ビューを唯一の active membership 源として使う。
// これにより「stale な channel_members / project_members に紐づく非活性ユーザーへ通知が漏れる」
// 経路を、各クエリで active を絞り忘れても構造的に塞ぐ。
import { db, channelMembers, channels, profiles, projectMembers, activeWorkspaceMembers } from '@cairn/db'
import { and, eq, inArray, isNotNull, isNull, ne, or } from 'drizzle-orm'

export interface NotificationRecipient {
  userId: string
  displayName: string
}

export async function fetchActiveChannelRecipients(params: {
  channelId: string
  workspaceId: string
  senderId: string
}): Promise<NotificationRecipient[]> {
  const { channelId, workspaceId, senderId } = params

  return db
    .select({ userId: channelMembers.userId, displayName: profiles.displayName })
    .from(channelMembers)
    .innerJoin(profiles, eq(channelMembers.userId, profiles.id))
    .innerJoin(
      activeWorkspaceMembers,
      and(
        eq(activeWorkspaceMembers.userId, channelMembers.userId),
        eq(activeWorkspaceMembers.workspaceId, workspaceId),
      ),
    )
    .innerJoin(channels, eq(channels.id, channelMembers.channelId))
    .leftJoin(
      projectMembers,
      and(
        eq(projectMembers.projectId, channels.projectId),
        eq(projectMembers.userId, channelMembers.userId),
      ),
    )
    .where(and(
      eq(channelMembers.channelId, channelId),
      ne(channelMembers.userId, senderId),
      or(
        ne(channels.type, 'project'),
        isNull(channels.projectId),
        ne(activeWorkspaceMembers.role, 'guest'),
        isNotNull(projectMembers.id),
      ),
    ))
}

export async function fetchActiveMentionedMembers(params: {
  workspaceId: string
  mentionedIds: string[]
  senderId: string
}): Promise<NotificationRecipient[]> {
  const { workspaceId, mentionedIds, senderId } = params

  if (mentionedIds.length === 0) return []

  return db
    .select({ userId: activeWorkspaceMembers.userId, displayName: profiles.displayName })
    .from(activeWorkspaceMembers)
    .innerJoin(profiles, eq(activeWorkspaceMembers.userId, profiles.id))
    .where(and(
      eq(activeWorkspaceMembers.workspaceId, workspaceId),
      inArray(activeWorkspaceMembers.userId, mentionedIds),
      ne(activeWorkspaceMembers.userId, senderId),
    ))
}

export async function fetchActiveGuestIds(params: {
  workspaceId: string
  userIds: string[]
}): Promise<Set<string>> {
  const { workspaceId, userIds } = params

  if (userIds.length === 0) return new Set()

  const rows = await db
    .select({ userId: activeWorkspaceMembers.userId })
    .from(activeWorkspaceMembers)
    .where(and(
      eq(activeWorkspaceMembers.workspaceId, workspaceId),
      eq(activeWorkspaceMembers.role, 'guest'),
      inArray(activeWorkspaceMembers.userId, userIds),
    ))

  return new Set(rows.map(row => row.userId))
}

export async function isActiveWorkspaceMember(params: {
  workspaceId: string
  userId: string
}): Promise<boolean> {
  const { workspaceId, userId } = params

  const [member] = await db
    .select({ userId: activeWorkspaceMembers.userId })
    .from(activeWorkspaceMembers)
    .where(and(
      eq(activeWorkspaceMembers.workspaceId, workspaceId),
      eq(activeWorkspaceMembers.userId, userId),
    ))

  return Boolean(member)
}
