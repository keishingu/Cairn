// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { ProfileAttributeColor, ProfileAttributeDto } from '@cairn/shared'

export async function getProfileAttributesByUserIds(
  workspaceId: string,
  userIds: string[],
): Promise<Map<string, ProfileAttributeDto[]>> {
  const result = new Map<string, ProfileAttributeDto[]>()
  if (userIds.length === 0) return result

  const {
    db,
    workspaceMembers,
    workspaceMemberProfileAttributes,
    workspaceProfileAttributes,
  } = await import('@cairn/db')
  const { and, asc, eq, inArray } = await import('drizzle-orm')
  const rows = await db
    .select({
      userId: workspaceMembers.userId,
      id: workspaceProfileAttributes.id,
      name: workspaceProfileAttributes.name,
      color: workspaceProfileAttributes.color,
    })
    .from(workspaceMemberProfileAttributes)
    .innerJoin(
      workspaceMembers,
      eq(workspaceMemberProfileAttributes.workspaceMemberId, workspaceMembers.id),
    )
    .innerJoin(
      workspaceProfileAttributes,
      eq(workspaceMemberProfileAttributes.profileAttributeId, workspaceProfileAttributes.id),
    )
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        inArray(workspaceMembers.userId, [...new Set(userIds)]),
      ),
    )
    .orderBy(asc(workspaceProfileAttributes.createdAt), asc(workspaceProfileAttributes.name))

  for (const row of rows) {
    const attributes = result.get(row.userId) ?? []
    attributes.push({ id: row.id, name: row.name, color: row.color as ProfileAttributeColor })
    result.set(row.userId, attributes)
  }
  return result
}
