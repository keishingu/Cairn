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
 * 取り込んだメッセージの送信者（messages.sender_id）は、全ワークスペース共通の
 * 「取り込み」システムプロフィール（IMPORT_SENDER_PROFILE_ID、profiles.kind = 'import'）にする。
 * 本当の投稿者は import_identities に持ち、表示時に上書きする。
 * Cairn ユーザーへの紐づけは import_identities.linked_user_id で行い、メッセージの行は書き換えない。
 */

/** 取り込んだメッセージの送信者にする共通のシステムプロフィール。マイグレーションで作る */
export const IMPORT_SENDER_PROFILE_ID = '00000000-0000-4000-8000-00000000c0de'

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
 * 取り込んだメッセージの元情報。(workspace, source, 会話 ID, メッセージ ID) で一意にし、二重登録を防ぐ。
 * 投稿者不明の投稿も元の属性を残し、後でキャッシュや他の参加者のエクスポートと照合し直せるようにする。
 */
export const importedMessages = pgTable(
  'imported_messages',
  {
    messageId: uuid('message_id')
      .primaryKey()
      .references(() => messages.id, { onDelete: 'cascade' }),
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
    originalSentAt: timestamp('original_sent_at', { withTimezone: true }).notNull(),
    originalEditedAt: timestamp('original_edited_at', { withTimezone: true }),
    // 取り込み元の属性（メッセージ種別・投稿者 ID/表示名の有無など）。本文は持たない
    attributes: jsonb('attributes').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('imported_messages_external_key').on(t.workspaceId, t.source, t.externalConversationId, t.externalMessageId),
    index('idx_imported_messages_identity').on(t.identityId),
  ],
).enableRLS()

/**
 * 取り込んだリアクション。message_reactions は Cairn ユーザー（profiles）単位で一意のため、
 * 取り込み元の人ごと（投稿者不明は時刻で区別）に別テーブルで持ち、表示時に合算する。
 */
export const importedMessageReactions = pgTable(
  'imported_message_reactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => importIdentities.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    sourceKey: text('source_key').notNull(),
    reactedAt: timestamp('reacted_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique('imported_message_reactions_unique').on(t.messageId, t.identityId, t.emoji, t.reactedAt),
    index('idx_imported_message_reactions_message').on(t.messageId),
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
    status: text('status').notNull().default('pending'),
    totalMessages: integer('total_messages').notNull().default(0),
    importedMessages: integer('imported_messages').notNull().default(0),
    duplicateMessages: integer('duplicate_messages').notNull().default(0),
    failedMessages: integer('failed_messages').notNull().default(0),
    error: text('error'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('import_job_conversations_unique').on(t.jobId, t.externalConversationId),
    check('import_job_conversations_status_check', sql`${t.status} in ('pending', 'running', 'completed', 'failed')`),
  ],
).enableRLS()
