// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { db } from '@cairn/db'
import { sql } from 'drizzle-orm'

type SqlClient = Pick<typeof db, 'execute'>

/** Vercelがmigrationより先に切り替わった間は、新形式の添付intent発行を保留する。 */
export async function hasAttachmentUploadRequestSchema(client: SqlClient): Promise<boolean> {
  const result = await client.execute<{ ready: boolean }>(sql`
    select (
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'upload_requests'
          and column_name = 'storage_bucket'
      )
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'upload_requests'
          and column_name = 'project_id'
          and is_nullable = 'YES'
      )
    ) as ready
  `)
  return result.rows[0]?.ready === true
}
