// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { ProfileAttributeColor, ProfileAttributeDto } from '@cairn/shared'

function hasDatabaseErrorCode(error: unknown, code: string) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

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
  let rows: Array<{ userId: string; id: string; name: string; color: string }>
  try {
    rows = await db
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
  } catch (error) {
    if (!hasDatabaseErrorCode(error, '42P01')) throw error

    try {
      const legacyRows = await db
        .select({
          userId: workspaceMembers.userId,
          profileAttributes: workspaceMembers.profileAttributes,
        })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            inArray(workspaceMembers.userId, [...new Set(userIds)]),
          ),
        )

      for (const row of legacyRows) {
        result.set(row.userId, row.profileAttributes.map((name, index) => ({
          id: `legacy:${index}`,
          name,
          color: 'slate',
        })))
      }
      return result
    } catch (legacyError) {
      // Vercel が両migrationより先に切り替わった間は、旧仕様どおり属性なしで表示する。
      if (hasDatabaseErrorCode(legacyError, '42703')) return result
      throw legacyError
    }
  }

  for (const row of rows) {
    const attributes = result.get(row.userId) ?? []
    attributes.push({ id: row.id, name: row.name, color: row.color as ProfileAttributeColor })
    result.set(row.userId, attributes)
  }
  return result
}
