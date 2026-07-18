// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { boolean, integer, jsonb, pgTable, pgView, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { eq } from 'drizzle-orm'
import { memberStatusEnum, userStatusEnum, workspaceRoleEnum } from './enums'

export interface WorkspaceCoverPhoto {
  id: string
  url: string
  storagePath: string
  name: string
}

export interface WorkspaceSettings {
  projectLabel?: string | null
  coverPhotos?: WorkspaceCoverPhoto[]
}

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  displayName: text('display_name').notNull(),
  bio: text('bio'),
  icalToken: text('ical_token').unique(),
  aiNudgesEnabled: boolean('ai_nudges_enabled').notNull().default(true),
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
    membershipStatus: memberStatusEnum('membership_status').notNull().default('active'),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    deactivatedBy: uuid('deactivated_by').references(() => profiles.id),
    avatarUrl: text('avatar_url'),
    displayName: text('display_name'),
    status: userStatusEnum('status').notNull().default('online'),
    statusMessage: text('status_message'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.workspaceId, t.userId)],
)

// active membership の唯一の定義。「非活性化されたメンバーは所属していない」という
// 不変条件をここ 1 箇所に閉じ込め、認可・一覧・通知などの読み取りはこのビューを経由する。
// 各クエリで `membership_status = 'active'` を手で足す必要（＝足し忘れ）が構造的に消える。
// active の定義を変える場合（例: deactivated_at IS NULL も条件に足す）もこのビューだけを直せばよい。
export const activeWorkspaceMembers = pgView('active_workspace_members').as((qb) =>
  qb.select().from(workspaceMembers).where(eq(workspaceMembers.membershipStatus, 'active')),
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

export const workspaceInvites = pgTable('workspace_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => profiles.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  maxUses: integer('max_uses'),
  useCount: integer('use_count').notNull().default(0),
  role: workspaceRoleEnum('role').notNull().default('member'),
  // ゲスト招待の場合、参加時に自動追加するプロジェクト（循環参照回避のため FK は migration SQL のみ）
  projectId: uuid('project_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.workspaceId, t.name)],
)
