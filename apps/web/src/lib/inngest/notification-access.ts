// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { db, channelMembers, channels, profiles, projectMembers, workspaceMembers } from '@cairn/db'
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
      workspaceMembers,
      and(
        eq(workspaceMembers.userId, channelMembers.userId),
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.membershipStatus, 'active'),
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
        ne(workspaceMembers.role, 'guest'),
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
    .select({ userId: workspaceMembers.userId, displayName: profiles.displayName })
    .from(workspaceMembers)
    .innerJoin(profiles, eq(workspaceMembers.userId, profiles.id))
    .where(and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.membershipStatus, 'active'),
      inArray(workspaceMembers.userId, mentionedIds),
      ne(workspaceMembers.userId, senderId),
    ))
}

export async function fetchActiveGuestIds(params: {
  workspaceId: string
  userIds: string[]
}): Promise<Set<string>> {
  const { workspaceId, userIds } = params

  if (userIds.length === 0) return new Set()

  const rows = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.membershipStatus, 'active'),
      eq(workspaceMembers.role, 'guest'),
      inArray(workspaceMembers.userId, userIds),
    ))

  return new Set(rows.map(row => row.userId))
}

export async function isActiveWorkspaceMember(params: {
  workspaceId: string
  userId: string
}): Promise<boolean> {
  const { workspaceId, userId } = params

  const [member] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, userId),
      eq(workspaceMembers.membershipStatus, 'active'),
    ))

  return Boolean(member)
}
