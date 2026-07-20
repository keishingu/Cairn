// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { bigint, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { workspaces } from './workspaces'

// Phase 0（計測）: ストレージ使用量カウンタ。制限・課金はまだかけない。
// アップロード前クライアント圧縮のみで、オリジナル別保存・表示用派生の生成は未実装のため、
// originalBytes は現在ストレージに実在する唯一の実体（圧縮後ファイル）の合計を指す。
// derivedBytes はオリジナル保存の実装（Phase 1 想定）まで常に 0。
export const workspaceStorageUsage = pgTable('workspace_storage_usage', {
  workspaceId: uuid('workspace_id')
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  originalBytes: bigint('original_bytes', { mode: 'number' }).notNull().default(0),
  derivedBytes: bigint('derived_bytes', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
