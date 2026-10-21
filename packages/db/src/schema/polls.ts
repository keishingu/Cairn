// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { appInstallations } from './apps'
import { channels, messages } from './channels'
import { profiles } from './workspaces'

// ファーストパーティの投票アプリが持つテーブル（docs/app-platform-design.md §7.2）。Cairn 本体のコードは読まない

/**
 * 投票。作成は冪等キーで1つに収束させ（定期ジョブ・モーダル・AI のどこから再試行されても二重に投稿しない。§7.4）、
 * カードは version と rendered_version の差で描き直す（commit 後に描き、漏れは定期的に拾い直す。§7.3）
 */
export const polls = pgTable(
  'polls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    installationId: uuid('installation_id')
      .notNull()
      .references(() => appInstallations.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    question: text('question').notNull(),
    allowMultiple: boolean('allow_multiple').notNull().default(false),
    // 第1段階は匿名投票を出さない（§11 D2）。列は残すが常に false
    anonymous: boolean('anonymous').notNull().default(false),
    // pending_post（投稿待ち）/ posted / closed / post_failed（投稿が再試行しても通らない理由で失敗した。拾い直さない）
    status: text('status').notNull().default('pending_post'),
    // post_failed の理由（Bot API のエラーコード）
    postError: text('post_error'),
    idempotencyKey: text('idempotency_key').notNull(),
    // 投稿する前に採番するメッセージ ID（chat.postMessage の client_msg_id）
    clientMsgId: uuid('client_msg_id').notNull().defaultRandom(),
    version: integer('version').notNull().default(0),
    renderedVersion: integer('rendered_version').notNull().default(-1),
    closesAt: timestamp('closes_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('polls_installation_idempotency_idx').on(t.installationId, t.idempotencyKey),
    uniqueIndex('polls_message_idx').on(t.messageId),
    // カードの ts は client_msg_id なので、投稿直後の操作もこれで投票を引く
    uniqueIndex('polls_client_msg_idx').on(t.clientMsgId),
    // 描画待ち・投稿待ちを拾い直す cron 用
    index('polls_needs_render_idx').on(t.updatedAt).where(sql`(${t.version} > ${t.renderedVersion} or ${t.status} = 'pending_post') and ${t.status} <> 'post_failed'`),
    check('polls_status_known', sql`${t.status} in ('pending_post', 'posted', 'closed', 'post_failed')`),
    check('polls_question_not_empty', sql`length(trim(${t.question})) > 0`),
  ],
).enableRLS()

export const pollOptions = pgTable(
  'poll_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [unique('poll_options_poll_position_unique').on(t.pollId, t.position)],
).enableRLS()

/**
 * 票。同じ選択肢への二重投票は一意制約で、単一選択の1人1票は部分一意インデックスで DB に強制する。
 * 部分索引から polls を参照できないため allow_multiple を非正規化する（scheduled-jobs-design.md 由来の設計）
 */
export const pollVotes = pgTable(
  'poll_votes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    optionId: uuid('option_id')
      .notNull()
      .references(() => pollOptions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    allowMultiple: boolean('allow_multiple').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('poll_votes_poll_option_user_unique').on(t.pollId, t.optionId, t.userId),
    uniqueIndex('poll_votes_single_choice_idx').on(t.pollId, t.userId).where(sql`${t.allowMultiple} = false`),
    index('poll_votes_poll_idx').on(t.pollId),
  ],
).enableRLS()

/** 処理済みのインタラクション。応答が失われて同じ押下が再送されても二重に処理しない（§5.4） */
export const pollProcessedInteractions = pgTable(
  'poll_processed_interactions',
  {
    interactionId: uuid('interaction_id').primaryKey(),
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('poll_processed_interactions_created_idx').on(t.createdAt)],
).enableRLS()
