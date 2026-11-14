// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import {
  ALL_MENTION_ID,
  ALL_MENTION_LABEL,
  PROJECT_MEMBERS_MENTION_ID,
  PROJECT_MEMBERS_MENTION_LABEL,
  attributeMentionTokenId,
  extractRoleMentionIds,
  roleMentionTokenId,
  extractAttributeMentionIds,
  extractMentionIds,
} from '@/lib/chat/mentions'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 本文群に含まれるメンション id → 表示ラベルのマップを組み立てる（ユーザー・予約・属性・役割） */
export async function buildMentionNameMap(
  workspaceId: string,
  contents: string[],
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>()
  nameMap.set(ALL_MENTION_ID, ALL_MENTION_LABEL)
  nameMap.set(PROJECT_MEMBERS_MENTION_ID, PROJECT_MEMBERS_MENTION_LABEL)

  // 手で書かれた `<@foo>` のような ID は UUID の列へ渡すと問い合わせごと失敗するため、UUID の形のものだけを引く
  const isUuid = (id: string) => UUID_RE.test(id)
  const userIds = [...new Set(contents.flatMap(extractMentionIds))].filter(isUuid)
  const attributeIds = [...new Set(contents.flatMap(extractAttributeMentionIds))].filter(isUuid)
  const roleIds = [...new Set(contents.flatMap(extractRoleMentionIds))].filter(isUuid)

  if (userIds.length === 0 && attributeIds.length === 0 && roleIds.length === 0) return nameMap

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
      // 表示用の所属履歴は非活性も含めるが、別ワークスペースの名前は解決しない。
      .innerJoin(
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

  if (roleIds.length > 0) {
    // 役割のメンションがあるときだけ引く（役割を使わない呼び出し元にスキーマの依存を増やさない）
    const { projectRoles } = await import('@cairn/db')
    const roleRows = await db
      .select({ id: projectRoles.id, name: projectRoles.name })
      .from(projectRoles)
      .where(and(eq(projectRoles.workspaceId, workspaceId), inArray(projectRoles.id, roleIds)))
    for (const role of roleRows) nameMap.set(roleMentionTokenId(role.id), role.name)
  }

  return nameMap
}
