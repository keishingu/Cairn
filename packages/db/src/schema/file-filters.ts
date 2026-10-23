// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { profiles, workspaces } from './workspaces'

/** ユーザーがワークスペースごとに保存するファイル一覧の絞り込み条件。 */
export const savedFileFilters = pgTable(
  'saved_file_filters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    conditions: jsonb('conditions').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('saved_file_filters_workspace_user_name_unique').on(
      t.workspaceId,
      t.userId,
      sql`lower(${t.name})`,
    ),
    index('saved_file_filters_workspace_user_idx').on(t.workspaceId, t.userId),
    check(
      'saved_file_filters_name_length',
      sql`length(trim(${t.name})) between 1 and 50`,
    ),
  ],
)
