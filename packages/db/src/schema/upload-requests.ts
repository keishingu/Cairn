// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { files } from './files'
import { projects } from './projects'
import { profiles, workspaces } from './workspaces'

// 署名付きURLでアップロードするオブジェクトを、確定まで追跡する。
// 有効期限後に未確定のオブジェクトを削除し、finalize の再試行もこの行で冪等にする。
export const uploadRequests = pgTable(
  'upload_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => profiles.id),
    fileName: text('file_name').notNull(),
    derivedMimeType: text('derived_mime_type').notNull(),
    originalMimeType: text('original_mime_type'),
    derivedStoragePath: text('derived_storage_path').notNull(),
    originalStoragePath: text('original_storage_path'),
    fileId: uuid('file_id').references(() => files.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('upload_requests_derived_storage_path_unique').on(t.derivedStoragePath),
    uniqueIndex('upload_requests_original_storage_path_unique').on(t.originalStoragePath),
    index('idx_upload_requests_expiration').on(t.expiresAt),
    index('idx_upload_requests_project_pending').on(t.projectId, t.finalizedAt),
  ],
)
