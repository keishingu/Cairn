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
  return lockActiveMemberships(client, workspaceId, [userId])
}

export async function lockActiveMemberships(
  client: SqlClient,
  workspaceId: string,
  userIds: string[],
): Promise<boolean> {
  const ids = [...new Set(userIds)].sort()
  if (ids.length === 0) return true
  const result = await client.execute(sql`
    select user_id
    from workspace_members
    where workspace_id = ${workspaceId}
      and user_id in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})
      and membership_status = 'active'
    order by user_id
    for share
  `)
  return result.rows.length === ids.length
}

export async function runForActiveMemberships<T>(
  client: TransactionClient,
  workspaceId: string,
  userIds: string[],
  action: (tx: Transaction) => Promise<T>,
): Promise<T | null> {
  return client.transaction(async (tx) => {
    if (!(await lockActiveMemberships(tx, workspaceId, userIds))) return null
    return action(tx)
  })
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
