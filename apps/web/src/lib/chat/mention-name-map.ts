// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import {
  ALL_MENTION_ID,
  ALL_MENTION_LABEL,
  PROJECT_MEMBERS_MENTION_ID,
  PROJECT_MEMBERS_MENTION_LABEL,
  attributeMentionTokenId,
  extractAttributeMentionIds,
  extractMentionIds,
} from '@/lib/chat/mentions'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'

/** 本文群に含まれるメンション id → 表示ラベルのマップを組み立てる（ユーザー・予約・属性） */
export async function buildMentionNameMap(
  workspaceId: string,
  contents: string[],
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>()
  nameMap.set(ALL_MENTION_ID, ALL_MENTION_LABEL)
  nameMap.set(PROJECT_MEMBERS_MENTION_ID, PROJECT_MEMBERS_MENTION_LABEL)

  const userIds = [...new Set(contents.flatMap(extractMentionIds))]
  const attributeIds = [...new Set(contents.flatMap(extractAttributeMentionIds))]

  if (userIds.length === 0 && attributeIds.length === 0) return nameMap

  const { db, profiles, workspaceMembers, workspaceProfileAttributes } = await import('@cairn/db')
  const { and, eq, inArray } = await import('drizzle-orm')

  if (userIds.length > 0) {
    const profileRows = await db
      .select({
        id: profiles.id,
        displayName: workspaceMemberDisplayName(
          workspaceMembers.displayName,
          profiles.displayName,
        ),
      })
      .from(profiles)
      .leftJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.userId, profiles.id),
          eq(workspaceMembers.workspaceId, workspaceId),
        ),
      )
      .where(inArray(profiles.id, userIds))
    for (const profile of profileRows) nameMap.set(profile.id, profile.displayName)
  }

  if (attributeIds.length > 0) {
    const attributeRows = await db
      .select({
        id: workspaceProfileAttributes.id,
        name: workspaceProfileAttributes.name,
      })
      .from(workspaceProfileAttributes)
      .where(
        and(
          eq(workspaceProfileAttributes.workspaceId, workspaceId),
          inArray(workspaceProfileAttributes.id, attributeIds),
        ),
      )
    for (const attribute of attributeRows) {
      nameMap.set(attributeMentionTokenId(attribute.id), attribute.name)
    }
  }

  return nameMap
}
