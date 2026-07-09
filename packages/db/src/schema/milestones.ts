// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { boolean, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { profiles } from './workspaces'
import { projects } from './projects'

export const milestones = pgTable(
  'milestones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    completed: boolean('completed').notNull().default(false),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_milestones_project').on(t.projectId, t.startDate)],
)
