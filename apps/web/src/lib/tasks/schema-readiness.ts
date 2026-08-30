// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { db } from '@cairn/db'
import { sql } from 'drizzle-orm'

type SqlClient = Pick<typeof db, 'execute'>

export interface LegacyTaskInsert {
  workspaceId: string
  projectId: string | null
  title: string
  description?: string | null
  status?: 'todo' | 'in_progress' | 'done'
  priority?: 'high' | 'medium' | 'low'
  assigneeId?: string | null
  dueDate?: string | null
  createdBy: string
  sourceMessageId?: string | null
  sourceCheckboxIndex?: number | null
}

export interface LegacyTaskRow extends Record<string, unknown> {
  id: string
  projectId: string | null
  title: string
  status: 'todo' | 'in_progress' | 'done'
  priority: 'high' | 'medium' | 'low'
  dueDate: string | null
  assigneeId: string | null
}

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

/** migration前のtasksには存在しないchannel_idをINSERT列へ含めずに保存する。 */
export async function insertLegacyTasks(
  client: SqlClient,
  rows: LegacyTaskInsert[],
): Promise<LegacyTaskRow[]> {
  if (rows.length === 0) return []

  const values = rows.map(
    (row) => sql`(
    ${row.workspaceId},
    ${row.projectId},
    ${row.title},
    ${row.description ?? null},
    ${row.status ?? 'todo'},
    ${row.priority ?? 'medium'},
    ${row.assigneeId ?? null},
    ${row.dueDate ?? null},
    ${row.createdBy},
    ${row.sourceMessageId ?? null},
    ${row.sourceCheckboxIndex ?? null}
  )`,
  )

  const result = await client.execute<LegacyTaskRow>(sql`
    insert into tasks (
      workspace_id,
      project_id,
      title,
      description,
      status,
      priority,
      assignee_id,
      due_date,
      created_by,
      source_message_id,
      source_checkbox_index
    )
    values ${sql.join(values, sql`, `)}
    returning
      id,
      project_id as "projectId",
      title,
      status,
      priority,
      due_date as "dueDate",
      assignee_id as "assigneeId"
  `)

  return result.rows
}
