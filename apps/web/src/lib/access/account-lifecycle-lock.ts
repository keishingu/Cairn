// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { db } from '@cairn/db'
import { sql } from 'drizzle-orm'

type SqlClient = Pick<typeof db, 'execute'>

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
export async function lockUsableAccount(client: SqlClient, userId: string): Promise<boolean> {
  const result = await client.execute(sql`
    select 1
    from profiles
    where id = ${userId}
      and coalesce(to_jsonb(profiles)->>'account_deletion_started_at', '') = ''
    for share
  `)
  return result.rows.length > 0
}
