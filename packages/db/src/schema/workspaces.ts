// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { boolean, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { workspaceRoleEnum } from './enums'

export interface WorkspaceSettings {
  projectLabel?: string | null
}

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  icalToken: text('ical_token').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  logoUrl: text('logo_url'),
  settings: jsonb('settings').$type<WorkspaceSettings>(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    role: workspaceRoleEnum('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.workspaceId, t.userId)],
)

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
  },
  (t) => [unique().on(t.workspaceId, t.name)],
)

export const projectStatuses = pgTable(
  'project_statuses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#3B82F6'),
    sortOrder: text('sort_order').notNull(),
    isFinal: boolean('is_final').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.workspaceId, t.name)],
)
