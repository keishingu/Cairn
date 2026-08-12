// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { db } from '@cairn/db'
import { sql } from 'drizzle-orm'

type SqlClient = Pick<typeof db, 'execute'>
type TransactionClient = Pick<typeof db, 'transaction'>
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type AccountLifecycleState = 'missing' | 'usable' | 'deleting'

export async function hasAccountLifecycleSchema(client: SqlClient): Promise<boolean> {
  const result = await client.execute<{ ready: boolean }>(sql`
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'account_deletion_started_at'
    ) as ready
  `)
  return result.rows[0]?.ready === true
}

/** 所属を作成・再活性化する処理を、退会処理と同じプロフィール行で直列化する。 */
export async function lockAccountLifecycle(
  client: SqlClient,
  userId: string,
): Promise<AccountLifecycleState> {
  await client.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`account:${userId}`}, 0))`,
  )
  const result = await client.execute<{ deletion_started: boolean }>(sql`
    select coalesce(to_jsonb(profiles)->>'account_deletion_started_at', '') <> '' as deletion_started
    from profiles
    where id = ${userId}
  `)
  if (!result.rows[0]) return 'missing'
  return result.rows[0].deletion_started ? 'deleting' : 'usable'
}

export async function lockUsableAccount(client: SqlClient, userId: string): Promise<boolean> {
  return (await lockAccountLifecycle(client, userId)) === 'usable'
}

export async function runForUsableAccount<T>(
  client: TransactionClient,
  userId: string,
  action: (tx: Transaction) => Promise<T>,
): Promise<T | null> {
  return client.transaction(async (tx) => {
    if (!(await lockUsableAccount(tx, userId))) return null
    return action(tx)
  })
}
