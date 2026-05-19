// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { index, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { profiles } from './workspaces'
import { projects } from './projects'
import { files } from './files'

export const galleryItems = pgTable(
  'gallery_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => profiles.id),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    caption: text('caption'),
    takenAt: timestamp('taken_at', { withTimezone: true }),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_gallery_project').on(t.projectId),
    index('idx_gallery_taken_at').on(t.takenAt),
  ],
)

export const galleryComments = pgTable('gallery_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  galleryItemId: uuid('gallery_item_id')
    .notNull()
    .references(() => galleryItems.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const galleryLikes = pgTable(
  'gallery_likes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    galleryItemId: uuid('gallery_item_id')
      .notNull()
      .references(() => galleryItems.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.galleryItemId, t.userId)],
)
