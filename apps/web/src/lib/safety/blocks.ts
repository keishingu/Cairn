// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { and, eq, inArray, or } from 'drizzle-orm'
import { db, userBlocks } from '@cairn/db'

export async function hasBlockBetween(userId: string, otherUserId: string): Promise<boolean> {
  const [row] = await db.select({ id: userBlocks.id }).from(userBlocks).where(or(
    and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, otherUserId)),
    and(eq(userBlocks.blockerId, otherUserId), eq(userBlocks.blockedId, userId)),
  )).limit(1)
  return !!row
}

export async function filterUnblockedRecipients(senderId: string, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return []
  const rows = await db.select({ blockerId: userBlocks.blockerId, blockedId: userBlocks.blockedId })
    .from(userBlocks)
    .where(or(
      and(eq(userBlocks.blockerId, senderId), inArray(userBlocks.blockedId, userIds)),
      and(eq(userBlocks.blockedId, senderId), inArray(userBlocks.blockerId, userIds)),
    ))
  const blocked = new Set(rows.map(row => row.blockerId === senderId ? row.blockedId : row.blockerId))
  return userIds.filter(id => !blocked.has(id))
}
