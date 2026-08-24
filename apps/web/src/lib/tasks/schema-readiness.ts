// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { db } from '@cairn/db'
import { sql } from 'drizzle-orm'

type SqlClient = Pick<typeof db, 'execute'>

/** Vercelがmigrationより先に切り替わった間は、通常チャンネルのタスク機能を保留する。 */
export async function hasTaskChannelSchema(client: SqlClient): Promise<boolean> {
  const result = await client.execute<{ ready: boolean }>(sql`
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tasks'
        and column_name = 'channel_id'
    ) as ready
  `)
  return result.rows[0]?.ready === true
}
