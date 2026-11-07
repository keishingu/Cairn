// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { channels, messages } from './channels'
import { files } from './files'
import { profiles, workspaces } from './workspaces'

/**
 * 外部チャットサービスからの取り込み（docs/import-design.md）。
 *
 * 取り込んだ過去ログは、まず import_staged_messages（一時保管）に置き、発言者を確定してから messages に移す（公開する）。
 * 公開したメッセージの送信者は、紐づけた Cairn ユーザー本人か、投稿者ごとの取り込み用プロフィール
 * （import_identities.profile_id、profiles.kind = 'import'）。表示時に送信者を差し替える処理は持たない。
 */

/** 取り込みジョブ。1回の取り込み操作（同じエクスポートの再実行は別ジョブ）ごとに1件 */
export const importJobs = pgTable(
  'import_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    // running → completed / failed / cancelled
    status: text('status').notNull().default('running'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    // 取り込み元のエクスポート日時（同じエクスポートかの目安。本文は持たない）
    exportedAt: timestamp('exported_at', { withTimezone: true }),
    // 件数の集計（会話数・取り込んだ件数・重複でスキップした件数など）
    stats: jsonb('stats').notNull().default({}),
    // 取り込まれなかった情報のレポート（件数と理由だけ。本文・氏名は持たない）
    report: jsonb('report').notNull().default({}),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_import_jobs_workspace').on(t.workspaceId, t.createdAt),
    check('import_jobs_status_check', sql`${t.status} in ('running', 'completed', 'failed', 'cancelled')`),
    check('import_jobs_source_check', sql`${t.source} in ('teams-consumer')`),
  ],
).enableRLS()

/**
 * 取り込み元の投稿者・リアクションした人。ワークスペース × 取り込み元 × 外部キーで一意。
 * external_key は `mri:<id>` / `name:<表示名>` / `anonymous`。
 */
export const importIdentities = pgTable(
  'import_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    externalKey: text('external_key').notNull(),
    displayName: text('display_name'),
    // 誰か区別できない投稿者をまとめたもの。Cairn ユーザーに紐づけられない
    isAnonymous: boolean('is_anonymous').notNull().default(false),
    kind: text('kind').notNull(),
    // 公開したメッセージの送信者にする、この投稿者の取り込み用プロフィール（profiles.kind = 'import'）。公開するときに作る
    profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
    // 管理者が確認して紐づけた Cairn ユーザー。退会・削除されたら紐づけだけ外れ、履歴は取り込み元の名前で残る
    linkedUserId: uuid('linked_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    linkedBy: uuid('linked_by').references(() => profiles.id, { onDelete: 'set null' }),
    linkedAt: timestamp('linked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('import_identities_workspace_source_key').on(t.workspaceId, t.source, t.externalKey),
    index('idx_import_identities_linked_user').on(t.linkedUserId),
    check('import_identities_anonymous_unlinked', sql`not (${t.isAnonymous} and ${t.linkedUserId} is not null)`),
    check('import_identities_kind_check', sql`${t.kind} in ('exporter', 'named', 'unnamed-participant', 'anonymous')`),
    check('import_identities_external_key_length', sql`char_length(${t.externalKey}) between 1 and 300`),
  ],
).enableRLS()

/**
 * 一時保管のメッセージ。(workspace, source, 会話 ID, メッセージ ID) で一意にし、二重登録を防ぐ。
 * 発言者（identity_id）を確定してから messages に移す。公開後も残し、紐づけの付け替え・解除と投稿者不明の補完に使う。
 * 投稿者不明の投稿も元の属性を残し、後でキャッシュや他の参加者のエクスポートと照合し直せるようにする。
 */
export const importStagedMessages = pgTable(
  'import_staged_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    externalConversationId: text('external_conversation_id').notNull(),
    externalMessageId: text('external_message_id').notNull(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => importIdentities.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').references(() => importJobs.id, { onDelete: 'set null' }),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    // Cairn の本文（Markdown。Parser が HTML を取り除き、メンション記法を無害化したもの）
    text: text('text').notNull(),
    quotedExternalMessageId: text('quoted_external_message_id'),
    // [{ identityKey, emoji, sourceKey, reactedAt }]
    reactions: jsonb('reactions').notNull().default([]),
    // 取り込み元のメディア ID（Teams は AMS オブジェクト ID）
    mediaObjectIds: jsonb('media_object_ids').notNull().default([]),
    // 取り込み元の属性（メッセージ種別・投稿者 ID/表示名の有無など）
    attributes: jsonb('attributes').notNull().default({}),
    // 公開した messages の行。未公開なら null
    publishedMessageId: uuid('published_message_id').references(() => messages.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('import_staged_messages_external_key').on(t.workspaceId, t.source, t.externalConversationId, t.externalMessageId),
    index('idx_import_staged_messages_identity').on(t.identityId),
    index('idx_import_staged_messages_published').on(t.publishedMessageId),
  ],
).enableRLS()

/**
 * 取り込んだメディア（Teams の AMS オブジェクト）と Cairn のファイルの対応。取り込み先チャンネルごとに持つ。
 * 同じチャンネルの中では同じオブジェクトを1回だけ保存して共有し、再実行ではアップロード済みのファイルを使い回す。
 * 別のチャンネルのファイルは使い回さない（非公開チャンネルに取り込んだ画像を、メディア ID だけで公開チャンネルに添付できてしまうため）。
 */
export const importedFiles = pgTable(
  'imported_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    externalObjectId: text('external_object_id').notNull(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    // アップロード先＝取り込み先のチャンネル。チャンネルが消えたら対応も消す
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').references(() => importJobs.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('imported_files_external_key').on(t.workspaceId, t.source, t.channelId, t.externalObjectId),
    index('idx_imported_files_file').on(t.fileId),
  ],
).enableRLS()

export const importJobConversations = pgTable(
  'import_job_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => importJobs.id, { onDelete: 'cascade' }),
    externalConversationId: text('external_conversation_id').notNull(),
    channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'set null' }),
    // 投稿者不明の投稿を、投稿者不明として一緒に公開する（include_unknown）か、残す（hold）か
    unknownPolicy: text('unknown_policy').notNull().default('include_unknown'),
    status: text('status').notNull().default('pending'),
    totalMessages: integer('total_messages').notNull().default(0),
    // 一時保管した件数（imported_messages）と、公開した件数
    importedMessages: integer('imported_messages').notNull().default(0),
    publishedMessages: integer('published_messages').notNull().default(0),
    duplicateMessages: integer('duplicate_messages').notNull().default(0),
    failedMessages: integer('failed_messages').notNull().default(0),
    error: text('error'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('import_job_conversations_unique').on(t.jobId, t.externalConversationId),
    check('import_job_conversations_status_check', sql`${t.status} in ('pending', 'running', 'completed', 'failed')`),
    check('import_job_conversations_unknown_policy_check', sql`${t.unknownPolicy} in ('include_unknown', 'hold')`),
  ],
).enableRLS()
