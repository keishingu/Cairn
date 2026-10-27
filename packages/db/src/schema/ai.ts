// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
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
  // 新着巡回時に24時間未満だった依頼を、チャンネルが静かなままでも成熟後に再評価する時刻。
  nextUnansweredAskCheckAt: timestamp('next_unanswered_ask_check_at', { withTimezone: true }),
  // 再評価する根拠メッセージ。高トラフィック時に直近ログだけを読んで依頼を見失わないため保持する。
  nextUnansweredAskMessageId: uuid('next_unanswered_ask_message_id').references(
    () => messages.id,
    { onDelete: 'set null' },
  ),
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

export type AiPendingActionType =
  | 'post_message'
  | 'invite_project_member'
  | 'set_project_member_role'
  | 'create_task'
export type AiPendingActionStatus =
  | 'pending'
  | 'executing'
  | 'executed'
  | 'failed'
  | 'rejected'
  | 'expired'

/**
 * AI が作った書き込みの実行案（docs/ai-automation-design.md §2.4）。承認者が承認したときだけ、承認者の権限で実行する。
 * 実行案は承認者本人にだけ見せる。payload は承認時の編集を反映した最終値で上書きし、実行結果は result / error に残す
 */
export const aiPendingActions = pgTable(
  'ai_pending_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    // /ai から提案した場合の会話。オートメーションの run から作る場合（Phase 3 以降）は null
    conversationId: uuid('conversation_id').references(() => aiConversations.id, { onDelete: 'cascade' }),
    // 承認・却下できる唯一の人（Skill では呼んだ本人）
    approverId: uuid('approver_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    actionType: text('action_type').$type<AiPendingActionType>().notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    // AI が実行案に添えた理由（承認カードに出す）
    reason: text('reason'),
    status: text('status').$type<AiPendingActionStatus>().notNull().default('pending'),
    result: jsonb('result').$type<Record<string, unknown>>(),
    error: text('error'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_ai_pending_actions_approver_status').on(t.approverId, t.status, t.createdAt),
    index('idx_ai_pending_actions_conversation').on(t.conversationId),
    check(
      'ai_pending_actions_type_known',
      sql`${t.actionType} in ('post_message', 'invite_project_member', 'set_project_member_role', 'create_task')`,
    ),
    check(
      'ai_pending_actions_status_known',
      sql`${t.status} in ('pending', 'executing', 'executed', 'failed', 'rejected', 'expired')`,
    ),
  ],
).enableRLS()

export type AiAutomationKind = 'skill' | 'cron' | 'heartbeat'
export type AiAutomationBuiltin = 'pmo_tasks' | 'pmo_messages'

/**
 * AI オートメーションの定義（docs/ai-automation-design.md §6）。指示文（raw_instruction）を実行時のプロンプトの正とし、
 * 保存時に確定できる部分（許可する書き込み・スケジュール・宛先など）だけを compiled に持つ。
 * 組み込みの AI PMO も Phase 2 で builtin の行として載せる
 */
export const aiAutomations = pgTable(
  'ai_automations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<AiAutomationKind>().notNull(),
    builtin: text('builtin').$type<AiAutomationBuiltin>(),
    // Skill は `$name` の name。ワークスペース内で一意
    name: text('name').notNull(),
    rawInstruction: text('raw_instruction'),
    compiled: jsonb('compiled').$type<Record<string, unknown>>().notNull().default({}),
    // ユーザー定義 heartbeat の読み取り範囲（Phase 4 で必須にする）
    scopeProjectId: uuid('scope_project_id').references(() => projects.id, { onDelete: 'cascade' }),
    // cron / heartbeat の書き込みの承認者。Skill は呼んだ本人が承認者なので null
    approverId: uuid('approver_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    enabled: boolean('enabled').notNull().default(true),
    pausedReason: text('paused_reason'),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ai_automations_workspace_name_idx').on(t.workspaceId, t.name),
    index('idx_ai_automations_next_run').on(t.nextRunAt).where(sql`${t.enabled} and ${t.nextRunAt} is not null`),
    check('ai_automations_kind_known', sql`${t.kind} in ('skill', 'cron', 'heartbeat')`),
    check('ai_automations_builtin_known', sql`${t.builtin} is null or ${t.builtin} in ('pmo_tasks', 'pmo_messages')`),
    // 先頭は英字（`$100` のような金額をスキルの呼び出しと取り違えないため）
    check('ai_automations_name_format', sql`${t.name} ~ '^[a-z][a-z0-9-]{0,39}$'`),
    // ユーザー定義は指示文が必須（組み込みは検知ロジックが本体なので持たない）
    check('ai_automations_instruction_required', sql`${t.builtin} is not null or length(trim(coalesce(${t.rawInstruction}, ''))) > 0`),
    check('ai_automations_instruction_length', sql`char_length(${t.rawInstruction}) <= 10000`),
    check('ai_automations_compiled_object', sql`jsonb_typeof(${t.compiled}) = 'object'`),
  ],
).enableRLS()

export type AiAutomationRunStatus = 'running' | 'success' | 'silent' | 'failed' | 'skipped'

/** オートメーションの実行記録。(automation_id, trigger_key) の予約で同じ発火を1回だけ進める（§6）。定義を削除しても残す */
export const aiAutomationRuns = pgTable(
  'ai_automation_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // 定義を削除しても実行記録は残す（監査と、1日の実行回数の上限を削除・作り直しで戻させないため）
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    automationId: uuid('automation_id').references(() => aiAutomations.id, { onDelete: 'set null' }),
    // cron: 予定時刻 / heartbeat: 差分カーソル終端 / skill: 呼び出しメッセージ ID / dry-run: 'dry:' + 実行 ID
    triggerKey: text('trigger_key').notNull(),
    // 実行した人（Skill の呼び出し・dry-run）。cron / heartbeat は null
    triggeredBy: uuid('triggered_by').references(() => profiles.id, { onDelete: 'set null' }),
    dryRun: boolean('dry_run').notNull().default(false),
    status: text('status').$type<AiAutomationRunStatus>().notNull().default('running'),
    evidence: jsonb('evidence').$type<unknown[]>().notNull().default([]),
    output: jsonb('output').$type<Record<string, unknown>>(),
    creditsUsed: integer('credits_used'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    unique('ai_automation_runs_trigger_unique').on(t.automationId, t.triggerKey),
    index('idx_ai_automation_runs_automation_started').on(t.automationId, t.startedAt),
    index('idx_ai_automation_runs_workspace_started').on(t.workspaceId, t.startedAt),
    check('ai_automation_runs_status_known', sql`${t.status} in ('running', 'success', 'silent', 'failed', 'skipped')`),
  ],
).enableRLS()
