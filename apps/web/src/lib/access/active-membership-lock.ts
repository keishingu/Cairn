// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { db } from '@cairn/db'
import { sql } from 'drizzle-orm'

type SqlClient = Pick<typeof db, 'execute'>

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
