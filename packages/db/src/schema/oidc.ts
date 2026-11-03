// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 「Cairn でログイン」（OIDC）。外部アプリに Cairn 専用の鍵で署名した ID トークンだけを渡す
// （docs/oidc-design.md）。MCP 用の OAuth（mcp-oauth.ts）とはクライアント・コード・トークンを分ける。
import { sql } from 'drizzle-orm'
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
import { profiles } from './workspaces'

/** 運営者がスクリプトで登録する外部アプリ。公開クライアント（サーバーなし）は client secret を持たない */
export const oidcClients = pgTable(
  'oidc_clients',
  {
    clientId: text('client_id').primaryKey(),
    clientName: text('client_name').notNull(),
    redirectUris: jsonb('redirect_uris').$type<string[]>().notNull(),
    clientType: text('client_type').$type<'public' | 'confidential'>().notNull(),
    clientSecretHash: text('client_secret_hash'),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('oidc_clients_name_not_empty', sql`length(trim(${t.clientName})) > 0`),
    check('oidc_clients_type', sql`${t.clientType} in ('public', 'confidential')`),
    check(
      'oidc_clients_secret_matches_type',
      sql`(${t.clientType} = 'confidential') = (${t.clientSecretHash} is not null)`,
    ),
  ],
).enableRLS()

/** 利用者が外部アプリに出した許可。同じスコープなら同意画面を省き、設定の「連携」に一覧する */
export const oidcGrants = pgTable(
  'oidc_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: text('client_id')
      .notNull()
      .references(() => oidcClients.clientId, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('oidc_grants_active_idx')
      .on(t.clientId, t.userId)
      .where(sql`${t.revokedAt} is null`),
    index('oidc_grants_user_idx').on(t.userId),
  ],
).enableRLS()

/** 認可コード。ハッシュだけを保存し、5分以内に1回だけ交換できる */
export const oidcAuthorizationCodes = pgTable(
  'oidc_authorization_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: text('client_id')
      .notNull()
      .references(() => oidcClients.clientId, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    scope: text('scope').notNull(),
    nonce: text('nonce'),
    codeChallenge: text('code_challenge').notNull(),
    authTime: timestamp('auth_time', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('oidc_authorization_codes_hash_idx').on(t.codeHash)],
).enableRLS()

/** UserInfo にだけ使える opaque なアクセストークン。Cairn のほかの API には使えない */
export const oidcAccessTokens = pgTable(
  'oidc_access_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: text('client_id')
      .notNull()
      .references(() => oidcClients.clientId, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
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
    uniqueIndex('oidc_access_tokens_hash_idx').on(t.tokenHash),
    check('oidc_access_tokens_rate_limit_nonnegative', sql`${t.rateLimitCount} >= 0`),
  ],
).enableRLS()
