// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { notificationTypeEnum } from './enums'
import { profiles, workspaces } from './workspaces'
import { channels, messages } from './channels'

export const channelReadStates = pgTable(
  'channel_read_states',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull().defaultNow(),
    lastReadMessageId: uuid('last_read_message_id').references(() => messages.id, {
      onDelete: 'set null',
    }),
    unreadMentionCount: integer('unread_mention_count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.userId, t.channelId),
    index('idx_channel_read_states_user').on(t.userId),
  ],
)

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    data: jsonb('data').$type<Record<string, string>>(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_notifications_user_created').on(t.userId, t.createdAt),
  ],
)

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    deviceType: text('device_type').notNull(), // 'web' | 'expo'
    // web: Web Push 購読 URL。expo: null
    endpoint: text('endpoint'),
    keys: jsonb('keys').$type<{ p256dh: string; auth: string }>(),
    // expo: Expo Push Token ("ExponentPushToken[...]")。web: null
    expoToken: text('expo_token'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Postgres の UNIQUE は NULL を比較から除外するため、両制約は相互干渉しない
    unique('uniq_push_web').on(t.userId, t.endpoint),
    unique('uniq_push_expo').on(t.userId, t.expoToken),
    index('idx_push_subscriptions_user').on(t.userId),
  ],
)
