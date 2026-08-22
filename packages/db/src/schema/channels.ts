// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { channelTypeEnum, contentReportReasonEnum, contentReportStatusEnum, messageTypeEnum } from './enums'
import { profiles, workspaces } from './workspaces'
import { projects } from './projects'
import { milestones } from './milestones'
import { files } from './files'

export const channels = pgTable(
  'channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    milestoneId: uuid('milestone_id').references(() => milestones.id, { onDelete: 'cascade' }),
    parentChannelId: uuid('parent_channel_id').references((): AnyPgColumn => channels.id, { onDelete: 'cascade' }),
    type: channelTypeEnum('type').notNull().default('project'),
    name: text('name'),
    isPrivate: boolean('is_private').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_channels_workspace_type').on(t.workspaceId, t.type),
    index('idx_channels_project').on(t.projectId),
    index('idx_channels_parent').on(t.parentChannelId),
    uniqueIndex('idx_channels_milestone_unique').on(t.milestoneId),
    check('channels_parent_not_self', sql`${t.parentChannelId} is null or ${t.parentChannelId} <> ${t.id}`),
  ],
)

export const channelMembers = pgTable(
  'channel_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.channelId, t.userId)],
)

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    parentMessageId: uuid('parent_message_id'),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => profiles.id),
    messageType: messageTypeEnum('message_type').notNull().default('text'),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_messages_channel').on(t.channelId, t.createdAt),
    index('idx_messages_content_trgm').using('gin', t.content.op('gin_trgm_ops')).where(sql`${t.deletedAt} is null`),
  ],
)

export const messageReactions = pgTable(
  'message_reactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.messageId, t.userId, t.emoji)],
)

export const messageAttachments = pgTable(
  'message_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_message_attachments_message').on(t.messageId)],
)

// メッセージの個人ブックマーク（チーム共通のピン留めではなく、各ユーザーが「後で見返す」ための保存）
export const messageBookmarks = pgTable(
  'message_bookmarks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.messageId, t.userId),
    index('idx_message_bookmarks_user').on(t.userId, t.createdAt),
  ],
)

export const userBlocks = pgTable(
  'user_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    blockerId: uuid('blocker_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.blockerId, t.blockedId),
    check('user_blocks_not_self', sql`${t.blockerId} <> ${t.blockedId}`),
    index('idx_user_blocks_blocked').on(t.blockedId),
  ],
)

export const contentReports = pgTable(
  'content_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').notNull().references(() => messages.id),
    reporterId: uuid('reporter_id').notNull().references(() => profiles.id),
    reportedUserId: uuid('reported_user_id').notNull().references(() => profiles.id),
    reason: contentReportReasonEnum('reason').notNull(),
    details: text('details'),
    contentSnapshot: text('content_snapshot').notNull(),
    status: contentReportStatusEnum('status').notNull().default('open'),
    resolutionNote: text('resolution_note'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => profiles.id),
    messageDeletedAt: timestamp('message_deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.messageId, t.reporterId),
    index('idx_content_reports_status_created').on(t.status, t.createdAt),
    index('idx_content_reports_workspace').on(t.workspaceId),
  ],
)
