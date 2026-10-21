// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import {
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { channels, messages } from './channels'
import { profiles, workspaces } from './workspaces'

// 第1段階で扱うスコープ。名前は Slack に合わせる（docs/app-platform-design.md §3.4）
export const APP_SCOPES = ['chat:write', 'users:read', 'channels:read'] as const
export type AppScope = (typeof APP_SCOPES)[number]

const appScopesCheck = (column: AnyPgColumn) =>
  sql`${column} <@ array['chat:write', 'users:read', 'channels:read']::text[]`

/**
 * Cairn に載せるアプリ。owner_workspace_id が null ならファーストパーティで、全ワークスペースへ提供する。
 * 署名シークレットは HMAC の計算に平文が要るため、hash ではなく token-crypto で暗号化して保存する。
 */
export const apps = pgTable(
  'apps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    iconUrl: text('icon_url'),
    ownerWorkspaceId: uuid('owner_workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    // https 限定はアプリ側で検証する。ローカル開発のファーストパーティアプリは http://localhost を使うため DB では縛らない
    requestUrl: text('request_url'),
    signingSecretEncrypted: text('signing_secret_encrypted'),
    requestedScopes: text('requested_scopes').array().notNull().default(sql`'{}'::text[]`),
    // 作成メニューに並べる起動口（docs/app-platform-design.md §6.1）
    entryPoints: jsonb('entry_points').notNull().default([]),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('apps_first_party_slug_idx').on(t.slug).where(sql`${t.ownerWorkspaceId} is null`),
    uniqueIndex('apps_workspace_slug_idx').on(t.ownerWorkspaceId, t.slug).where(sql`${t.ownerWorkspaceId} is not null`),
    check('apps_slug_format', sql`${t.slug} ~ '^[a-z0-9][a-z0-9-]{0,62}$'`),
    check('apps_name_not_empty', sql`length(trim(${t.name})) > 0`),
    check('apps_requested_scopes_known', appScopesCheck(t.requestedScopes)),
    check('apps_entry_points_array', sql`jsonb_typeof(${t.entryPoints}) = 'array'`),
    // 署名できない宛先へインタラクションを送らせない
    check('apps_request_url_has_secret', sql`${t.requestUrl} is null or ${t.signingSecretEncrypted} is not null`),
  ],
).enableRLS()

/**
 * アプリのワークスペースへのインストール。Bot profile はインストールごとに1つで、取り消し後も
 * 過去のメッセージの送信者表示に使うため削除しない（revoked_at で投稿・更新を止める）。
 */
export const appInstallations = pgTable(
  'app_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    botProfileId: uuid('bot_profile_id')
      .notNull()
      .references(() => profiles.id),
    grantedScopes: text('granted_scopes').array().notNull().default(sql`'{}'::text[]`),
    // 既定インストール（ファーストパーティ）は人の操作ではないため null
    installedBy: uuid('installed_by').references(() => profiles.id, { onDelete: 'set null' }),
    installedAt: timestamp('installed_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('app_installations_app_workspace_idx').on(t.appId, t.workspaceId),
    uniqueIndex('app_installations_bot_profile_idx').on(t.botProfileId),
    // app_channel_memberships の複合 FK の参照先
    uniqueIndex('app_installations_id_workspace_idx').on(t.id, t.workspaceId),
    index('app_installations_workspace_idx').on(t.workspaceId),
    check('app_installations_granted_scopes_known', appScopesCheck(t.grantedScopes)),
  ],
).enableRLS()

/**
 * Bot トークン（`cairn_bot_...`）。PAT と同じく平文は発行時に一度だけ返し、DB には SHA-256 のみ保存する。
 * ファーストパーティだけは平文を控える人がいない（自動プロビジョニング）ため、token-crypto で暗号化した平文も持つ。
 */
export const appBotTokens = pgTable(
  'app_bot_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    installationId: uuid('installation_id')
      .notNull()
      .references(() => appInstallations.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    // ファーストパーティのインストールに限る（外部アプリには持たせない。アプリ側で検証する）
    tokenEncrypted: text('token_encrypted'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    rateLimitWindowStartedAt: timestamp('rate_limit_window_started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    rateLimitCount: integer('rate_limit_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('app_bot_tokens_token_hash_idx').on(t.tokenHash),
    index('app_bot_tokens_installation_idx').on(t.installationId),
    check('app_bot_tokens_rate_limit_count_nonnegative', sql`${t.rateLimitCount} >= 0`),
  ],
).enableRLS()

/**
 * Bot が投稿できるチャンネル。Bot は channel_members に入れない（未読・通知・メンション候補が人間前提のため）。
 * workspace_id を installation とチャンネルの両方へ複合 FK で一致させ、別ワークスペースのチャンネルへ紐づけさせない。
 */
export const appChannelMemberships = pgTable(
  'app_channel_memberships',
  {
    installationId: uuid('installation_id')
      .notNull()
      .references(() => appInstallations.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').notNull(),
    workspaceId: uuid('workspace_id').notNull(),
    addedBy: uuid('added_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.installationId, t.channelId] }),
    foreignKey({
      name: 'app_channel_memberships_installation_workspace_fk',
      columns: [t.installationId, t.workspaceId],
      foreignColumns: [appInstallations.id, appInstallations.workspaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'app_channel_memberships_channel_workspace_fk',
      columns: [t.channelId, t.workspaceId],
      foreignColumns: [channels.id, channels.workspaceId],
    }).onDelete('cascade'),
    index('app_channel_memberships_channel_idx').on(t.channelId),
  ],
).enableRLS()

/**
 * message_type = 'blocks' のメッセージのカード本体。messages にカラムを足さず別テーブルにするのは、
 * マイグレーションより先に新コードが動いた時間に通常の投稿（messages への INSERT）まで失敗させないため。
 * chat.update はこの行だけを更新し、messages.updated_at を動かさない（動かすと「編集済み」が付く）。
 */
export const messageBlocks = pgTable(
  'message_blocks',
  {
    messageId: uuid('message_id')
      .primaryKey()
      .references(() => messages.id, { onDelete: 'cascade' }),
    // インストールは取り消しで止め行は消さない。cascade はワークスペース・アプリ自体の削除のため
    installationId: uuid('installation_id')
      .notNull()
      .references(() => appInstallations.id, { onDelete: 'cascade' }),
    blocks: jsonb('blocks').notNull(),
    // どの版の packages/shared のスキーマで受理したか（docs/app-platform-design.md §4.4）
    schemaVersion: integer('schema_version').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('message_blocks_installation_idx').on(t.installationId),
    check('message_blocks_blocks_array', sql`jsonb_typeof(${t.blocks}) = 'array'`),
    check('message_blocks_schema_version_positive', sql`${t.schemaVersion} > 0`),
  ],
).enableRLS()

/**
 * アプリへのインタラクション（ボタン押下・選択・モーダル送信）の配送ログ。設定画面でアプリ管理者が直近の失敗を見るため。
 * 中身（ペイロード）は残さない。30日で消す（docs/app-platform-design.md §5.4・§11 D10）
 */
export const appInteractionDeliveries = pgTable(
  'app_interaction_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    installationId: uuid('installation_id').notNull(),
    // 押した人。退会しても配送ログは残す
    userId: uuid('user_id'),
    // block_actions / view_submission / view_closed
    type: text('type').notNull(),
    actionId: text('action_id'),
    // delivered / failed / timeout / blocked（送り先の検証で送らなかった）
    status: text('status').notNull(),
    httpStatus: integer('http_status'),
    durationMs: integer('duration_ms'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Drizzle の既定名は 63 文字を超えて Postgres に切り詰められるため、短い名前を明示する（マイグレーションと同じ名前）
    foreignKey({ name: 'app_interaction_deliveries_installation_fk', columns: [t.installationId], foreignColumns: [appInstallations.id] }).onDelete('cascade'),
    foreignKey({ name: 'app_interaction_deliveries_user_fk', columns: [t.userId], foreignColumns: [profiles.id] }).onDelete('set null'),
    index('app_interaction_deliveries_installation_created_idx').on(t.installationId, t.createdAt),
    // 30日を過ぎた記録の削除（全インストール横断の created_at の範囲）に使う
    index('app_interaction_deliveries_created_idx').on(t.createdAt),
    check('app_interaction_deliveries_status_known', sql`${t.status} in ('delivered', 'failed', 'timeout', 'blocked')`),
  ],
).enableRLS()

/**
 * モーダルを開くための trigger_id。インタラクションを届けるときに発行し、3秒・1回だけ使える（Slack と同じ）。
 * 押した本人・アプリのインストールに結びつけ、他人の画面にモーダルを開かせない。平文は送るだけで、DB には hash を置く
 */
export const appTriggers = pgTable(
  'app_triggers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    installationId: uuid('installation_id')
      .notNull()
      .references(() => appInstallations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('app_triggers_token_hash_idx').on(t.tokenHash),
    index('app_triggers_expires_idx').on(t.expiresAt),
  ],
).enableRLS()

/**
 * アプリが開いたモーダル（view）。開いた本人の画面にだけ出す。Realtime で本人のトピックへ知らせ、クライアントが開く。
 * hash は views.update の競合検出に使う（Slack と同じ）
 */
export const appViews = pgTable(
  'app_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    installationId: uuid('installation_id')
      .notNull()
      .references(() => appInstallations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    // 開いた起点のチャンネル。作成メニューから開いたモーダルの送信先を後で解決するため
    // チャンネルが消えたらモーダルも消す（null にすると、送信時のチャンネルの確認を素通りして届いてしまう）
    channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'cascade' }),
    view: jsonb('view').notNull(),
    hash: text('hash').notNull(),
    // open / submitted / closed
    status: text('status').notNull().default('open'),
    // 送信をアプリへ届けている間だけ入る。同じモーダルの同時送信で view_submission が二重に届かないよう、送信前にこれで確保する。
    // 処理中に落ちても期限を過ぎれば再び送信できる
    submittingUntil: timestamp('submitting_until', { withTimezone: true }),
    schemaVersion: integer('schema_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('app_views_user_status_idx').on(t.userId, t.status),
    check('app_views_status_known', sql`${t.status} in ('open', 'submitted', 'closed')`),
    check('app_views_view_object', sql`jsonb_typeof(${t.view}) = 'object'`),
  ],
).enableRLS()
