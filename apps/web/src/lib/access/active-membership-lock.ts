// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { db } from '@cairn/db'
import { sql } from 'drizzle-orm'

type SqlClient = Pick<typeof db, 'execute'>
type TransactionClient = Pick<typeof db, 'transaction'>
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function lockActiveMembership(
  client: SqlClient,
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const result = await client.execute(sql`
    select 1
    from workspace_members
    where workspace_id = ${workspaceId}
      and user_id = ${userId}
      and membership_status = 'active'
    for share
  `)
  return result.rows.length > 0
}

export async function runForActiveMembership<T>(
  client: TransactionClient,
  workspaceId: string,
  userId: string,
  action: (tx: Transaction) => Promise<T>,
): Promise<T | null> {
  return client.transaction(async (tx) => {
    if (!(await lockActiveMembership(tx, workspaceId, userId))) return null
    return action(tx)
  })
}
