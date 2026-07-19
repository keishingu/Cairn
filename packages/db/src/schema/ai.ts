// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { aiScopeEnum } from './enums'
import { profiles, workspaces } from './workspaces'
import { projects } from './projects'
import { channels, messages } from './channels'
import { tasks } from './tasks'

export type AiNudgeDetector =
  | 'task_due_soon'
  | 'task_overdue'
  | 'task_stalled'
  | 'unanswered_ask'
  | 'llm_risk'
export type AiNudgeStatus = 'active' | 'dismissed' | 'resolved' | 'suppressed'
export type AiNudgeFeedback = 'later' | 'not_helpful'

export const aiAgents = pgTable('ai_agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  scope: aiScopeEnum('scope').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  model: text('model').notNull(),
  systemPrompt: text('system_prompt'),
  agentsMd: text('agents_md'),
  htmlTemplate: text('html_template'),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => aiAgents.id, { onDelete: 'cascade' }),
    title: text('title'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_ai_conversations_workspace').on(t.workspaceId)],
)

export const aiMessages = pgTable('ai_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => aiConversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  annotations: jsonb('annotations').$type<unknown[]>(),
  toolInvocations: jsonb('tool_invocations').$type<unknown[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// LLM 巡回がチャンネルごとに保持する差分カーソル。
// チャンネル削除時は状態も不要になる一方、最後に読んだメッセージだけが削除された場合は
// last_scanned_at をフォールバックとして再開できるようカーソル参照だけを NULL にする。
export const aiScanStates = pgTable('ai_scan_states', {
  channelId: uuid('channel_id')
    .primaryKey()
    .references(() => channels.id, { onDelete: 'cascade' }),
  lastScannedMessageId: uuid('last_scanned_message_id').references(() => messages.id, {
    onDelete: 'set null',
  }),
  lastScannedAt: timestamp('last_scanned_at', { withTimezone: true }).notNull(),
})

// 本人だけに見える PMO ナッジ。append-only なイベントではなく、
// (user_id, dedupe_key) ごとの「関心事の現在状態」としてハートビートがリコンサイルする。
export const aiNudges = pgTable(
  'ai_nudges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
    detector: text('detector').$type<AiNudgeDetector>().notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    reason: jsonb('reason').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').$type<AiNudgeStatus>().notNull().default('active'),
    feedback: text('feedback').$type<AiNudgeFeedback>(),
    remindAfter: timestamp('remind_after', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (t) => [
    unique('ai_nudges_user_dedupe_unique').on(t.userId, t.dedupeKey),
    index('idx_ai_nudges_user_status_created').on(t.userId, t.status, t.createdAt),
    index('idx_ai_nudges_channel_user').on(t.channelId, t.userId),
    index('idx_ai_nudges_cooldown').on(t.userId, t.detector, t.taskId, t.status, t.remindAfter),
    index('idx_ai_nudges_message_cooldown').on(
      t.userId,
      t.detector,
      t.messageId,
      t.status,
      t.remindAfter,
    ),
    // 宛先復元は同じ問いを候補者複数へ送らないことをDB境界でも保証する。
    uniqueIndex('ai_nudges_unanswered_message_unique')
      .on(t.messageId)
      .where(sql`${t.detector} = 'unanswered_ask' AND ${t.messageId} IS NOT NULL`),
  ],
)
