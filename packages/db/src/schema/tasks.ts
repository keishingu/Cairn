// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { date, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { taskPriorityEnum, taskStatusEnum } from './enums'
import { profiles } from './workspaces'
import { projects } from './projects'
import { messages } from './channels'

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
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
})
