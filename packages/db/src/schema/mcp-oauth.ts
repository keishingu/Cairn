// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { apiTokenScopeEnum } from './enums'
import { profiles, workspaces } from './workspaces'

export const mcpOAuthClients = pgTable(
  'mcp_oauth_clients',
  {
    clientId: text('client_id').primaryKey(),
    clientName: text('client_name').notNull(),
    redirectUris: jsonb('redirect_uris').$type<string[]>().notNull(),
    applicationType: text('application_type').notNull().default('web'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('mcp_oauth_clients_name_not_empty', sql`length(trim(${t.clientName})) > 0`)],
)

export const mcpOAuthConnections = pgTable(
  'mcp_oauth_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: text('client_id')
      .notNull()
      .references(() => mcpOAuthClients.clientId, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    scope: apiTokenScopeEnum('scope').notNull().default('read'),
    resource: text('resource').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('mcp_oauth_connections_user_workspace_idx').on(t.userId, t.workspaceId)],
)

export const mcpOAuthAuthorizationCodes = pgTable(
  'mcp_oauth_authorization_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => mcpOAuthConnections.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    codeChallenge: text('code_challenge').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('mcp_oauth_authorization_codes_hash_idx').on(t.codeHash)],
)

export const mcpOAuthAccessTokens = pgTable(
  'mcp_oauth_access_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => mcpOAuthConnections.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    rateLimitWindowStartedAt: timestamp('rate_limit_window_started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    rateLimitCount: integer('rate_limit_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('mcp_oauth_access_tokens_hash_idx').on(t.tokenHash),
    check('mcp_oauth_access_tokens_rate_limit_nonnegative', sql`${t.rateLimitCount} >= 0`),
    check('mcp_oauth_access_tokens_expires_after_creation', sql`${t.expiresAt} > ${t.createdAt}`),
  ],
)

export const mcpOAuthRefreshTokens = pgTable(
  'mcp_oauth_refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => mcpOAuthConnections.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('mcp_oauth_refresh_tokens_hash_idx').on(t.tokenHash),
    check('mcp_oauth_refresh_tokens_expires_after_creation', sql`${t.expiresAt} > ${t.createdAt}`),
  ],
)
