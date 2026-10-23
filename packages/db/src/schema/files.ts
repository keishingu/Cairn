// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { bigint, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
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
    // storagePath は家賃対象の原本。既存行は圧縮済みの唯一の実体をここへ保持する。
    storagePath: text('storage_path'),
    // 表示・風化時のフォールバックに使う圧縮派生。家賃対象外。
    derivedStoragePath: text('derived_storage_path'),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type'),
    derivedMimeType: text('derived_mime_type'),
    fileSize: bigint('file_size', { mode: 'number' }),
    derivedFileSize: bigint('derived_file_size', { mode: 'number' }),
    fileType: fileTypeEnum('file_type').notNull().default('document'),
    version: integer('version').notNull().default(1),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_files_project').on(t.projectId),
    // ストレージ使用量の workspace 単位集約（SUM(file_size)）用。
    // 詳細: docs/billing-implementation-design.md #4
    index('idx_files_workspace').on(t.workspaceId),
    // 同じストレージオブジェクトを再試行で二重に確定しない。
    uniqueIndex('files_workspace_storage_path_unique').on(t.workspaceId, t.storagePath),
  ],
)
