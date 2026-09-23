// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// @all / @project_members / 属性メンションを active メンバーの userId 一覧へ展開する。
// チャンネル到達可否の絞り込みは呼び出し側で filterMentionRecipients に委ねる。
// 非活性メンバーは active_workspace_members 経由のためここに現れない。

export type ExpandedMentionMember = {
  userId: string
  displayName: string
}

export async function listActiveWorkspaceMembersExcept(
  workspaceId: string,
  excludeUserId: string,
): Promise<ExpandedMentionMember[]> {
  const { db, activeWorkspaceMembers, profiles } = await import('@cairn/db')
  const { and, eq, ne } = await import('drizzle-orm')
  return db
    .select({
      userId: activeWorkspaceMembers.userId,
      displayName: profiles.displayName,
    })
    .from(activeWorkspaceMembers)
    .innerJoin(profiles, eq(activeWorkspaceMembers.userId, profiles.id))
    .where(
      and(
        eq(activeWorkspaceMembers.workspaceId, workspaceId),
        ne(activeWorkspaceMembers.userId, excludeUserId),
      ),
    )
}

/** プロジェクト参加者のうち active な人だけ（非プロジェクトチャンネルでは空） */
export async function listActiveProjectMembersExcept(
  workspaceId: string,
  projectId: string | null | undefined,
  excludeUserId: string,
): Promise<ExpandedMentionMember[]> {
  if (!projectId) return []

  const { db, activeWorkspaceMembers, profiles, projectMembers } = await import('@cairn/db')
  const { and, eq, ne } = await import('drizzle-orm')
  return db
    .select({
      userId: activeWorkspaceMembers.userId,
      displayName: profiles.displayName,
    })
    .from(projectMembers)
    .innerJoin(
      activeWorkspaceMembers,
      and(
        eq(activeWorkspaceMembers.userId, projectMembers.userId),
        eq(activeWorkspaceMembers.workspaceId, workspaceId),
      ),
    )
    .innerJoin(profiles, eq(activeWorkspaceMembers.userId, profiles.id))
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        ne(activeWorkspaceMembers.userId, excludeUserId),
      ),
    )
}

export async function listActiveMembersByAttributeIds(
  workspaceId: string,
  attributeIds: string[],
  excludeUserId: string,
): Promise<ExpandedMentionMember[]> {
  if (attributeIds.length === 0) return []

  const {
    db,
    activeWorkspaceMembers,
    profiles,
    workspaceMembers,
    workspaceMemberProfileAttributes,
  } = await import('@cairn/db')
  const { and, eq, inArray, ne } = await import('drizzle-orm')

  return db
    .selectDistinct({
      userId: activeWorkspaceMembers.userId,
      displayName: profiles.displayName,
    })
    .from(workspaceMemberProfileAttributes)
    .innerJoin(
      workspaceMembers,
      eq(workspaceMemberProfileAttributes.workspaceMemberId, workspaceMembers.id),
    )
    .innerJoin(
      activeWorkspaceMembers,
      and(
        eq(activeWorkspaceMembers.userId, workspaceMembers.userId),
        eq(activeWorkspaceMembers.workspaceId, workspaceMembers.workspaceId),
      ),
    )
    .innerJoin(profiles, eq(activeWorkspaceMembers.userId, profiles.id))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        inArray(workspaceMemberProfileAttributes.profileAttributeId, attributeIds),
        ne(activeWorkspaceMembers.userId, excludeUserId),
      ),
    )
}

/** 複数ソースのメンション宛先を userId で重複排除してマージする */
export function mergeMentionMembers(
  ...groups: ExpandedMentionMember[][]
): ExpandedMentionMember[] {
  const map = new Map<string, ExpandedMentionMember>()
  for (const group of groups) {
    for (const member of group) {
      map.set(member.userId, member)
    }
  }
  return [...map.values()]
}
