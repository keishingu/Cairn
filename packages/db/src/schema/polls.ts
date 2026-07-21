// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { boolean, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { channels, messages } from './channels'
import { profiles, workspaces } from './workspaces'

export const polls = pgTable(
  'polls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => profiles.id),
    question: text('question').notNull(),
    allowMultiple: boolean('allow_multiple').notNull().default(false),
    anonymous: boolean('anonymous').notNull().default(false),
    closesAt: timestamp('closes_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.messageId),
    index('idx_polls_workspace').on(t.workspaceId, t.createdAt),
    index('idx_polls_channel').on(t.channelId, t.createdAt),
  ],
)

export const pollOptions = pgTable(
  'poll_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [
    unique().on(t.pollId, t.position),
    index('idx_poll_options_poll').on(t.pollId, t.position),
  ],
)

export const pollVotes = pgTable(
  'poll_votes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    optionId: uuid('option_id')
      .notNull()
      .references(() => pollOptions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    allowMultiple: boolean('allow_multiple').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.pollId, t.optionId, t.userId),
    index('idx_poll_votes_poll').on(t.pollId, t.createdAt),
    index('idx_poll_votes_option').on(t.optionId, t.createdAt),
  ],
)
