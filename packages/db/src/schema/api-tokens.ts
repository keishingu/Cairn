// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { apiTokenScopeEnum } from './enums'
import { profiles, workspaces } from './workspaces'

/**
 * 外部 MCP クライアント用 PAT。平文は発行時に一度だけ返し、DB には SHA-256 のみ保存する。
 * token の workspace は固定で、リクエストヘッダーから切り替えられない。
 */
export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    scope: apiTokenScopeEnum('scope').notNull().default('read'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    rateLimitWindowStartedAt: timestamp('rate_limit_window_started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    rateLimitCount: integer('rate_limit_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('api_tokens_token_hash_idx').on(t.tokenHash),
    index('api_tokens_user_workspace_idx').on(t.userId, t.workspaceId),
    check('api_tokens_name_not_empty', sql`length(trim(${t.name})) > 0`),
    check('api_tokens_rate_limit_count_nonnegative', sql`${t.rateLimitCount} >= 0`),
    check('api_tokens_expires_after_creation', sql`${t.expiresAt} > ${t.createdAt}`),
    check('api_tokens_maximum_lifetime', sql`${t.expiresAt} <= ${t.createdAt} + interval '1 year'`),
  ],
)
