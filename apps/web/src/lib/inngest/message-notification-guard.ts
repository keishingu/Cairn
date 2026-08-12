// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { db } from '@cairn/db'
import { sql } from 'drizzle-orm'
import { lockActiveMembership } from '@/lib/access/active-membership-lock'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function runForActiveMessageSender<T>(
  messageId: string,
  workspaceId: string,
  senderId: string,
  action: (tx: Transaction) => Promise<T>,
): Promise<T | null> {
  return db.transaction(async (tx) => {
    if (!(await lockActiveMembership(tx, workspaceId, senderId))) return null

    const source = await tx.execute(sql`
      select 1
      from messages m
      where m.id = ${messageId}
        and m.sender_id = ${senderId}
        and m.deleted_at is null
    `)
    if (source.rows.length === 0) return null
    return action(tx)
  })
}
