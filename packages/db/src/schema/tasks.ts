// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { sql } from 'drizzle-orm'
import { date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { taskPriorityEnum, taskStatusEnum } from './enums'
import { profiles, workspaces } from './workspaces'
import { projects } from './projects'
import { channels, messages } from './channels'

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  // プロジェクト未所属のタスクを許可するため任意（NULL 可）。ワークスペースへの所属は workspace_id で担保する
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  status: taskStatusEnum('status').notNull().default('todo'),
  priority: taskPriorityEnum('priority').notNull().default('medium'),
  assigneeId: uuid('assignee_id').references(() => profiles.id),
  dueDate: date('due_date'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  sourceMessageId: uuid('source_message_id').references(() => messages.id, { onDelete: 'set null' }),
  sourceCheckboxIndex: integer('source_checkbox_index'),
}, (t) => [
  index('idx_tasks_channel').on(t.channelId),
  // メッセージの「タスク化する」は1メッセージ内で同じタイトルを1件にする（複数行を別タスクにできる）。同時リクエストでも重複させない。
  // 旧チェックボックス由来（source_checkbox_index あり）は1メッセージに複数あるため対象外。
  uniqueIndex('uniq_tasks_message_task_title')
    .on(t.sourceMessageId, t.title)
    .where(sql`${t.sourceMessageId} is not null and ${t.sourceCheckboxIndex} is null`),
])
