// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { boolean, date, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { attendanceStatusEnum, projectMemberRoleEnum } from './enums'
import { profiles, projectStatuses, tags, workspaces } from './workspaces'

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    statusId: uuid('status_id').references(() => projectStatuses.id),
    startDate: date('start_date'),
    endDate: date('end_date'),
    archived: boolean('archived').notNull().default(false),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_projects_workspace').on(t.workspaceId),
    index('idx_projects_status').on(t.statusId),
    index('idx_projects_date').on(t.startDate, t.endDate),
  ],
)

export const projectMembers = pgTable(
  'project_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    role: projectMemberRoleEnum('role').notNull().default('member'),
    attendance: attendanceStatusEnum('attendance').notNull().default('attending'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.projectId, t.userId)],
)

export const memberExperiences = pgTable('member_experiences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  title: text('title').notNull(),
  level: text('level'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const projectTags = pgTable(
  'project_tags',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [unique().on(t.projectId, t.tagId)],
)
