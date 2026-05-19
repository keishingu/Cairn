// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { bigint, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { fileTypeEnum } from './enums'
import { profiles, workspaces } from './workspaces'
import { projects } from './projects'

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => profiles.id),
    storagePath: text('storage_path').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type'),
    fileSize: bigint('file_size', { mode: 'number' }),
    fileType: fileTypeEnum('file_type').notNull().default('document'),
    version: integer('version').notNull().default(1),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_files_project').on(t.projectId)],
)
