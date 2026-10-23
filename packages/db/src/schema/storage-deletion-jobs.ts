// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

export interface StorageDeletionTarget {
  bucket: string
  paths: string[]
}

// DB 削除と外部ストレージ削除の間をつなぐ outbox。イベント送信に失敗してもジョブを残し、
// cron から再送できるようにする。
export const storageDeletionJobs = pgTable('storage_deletion_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  targets: jsonb('targets').$type<StorageDeletionTarget[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
