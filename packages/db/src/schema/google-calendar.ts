// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { profiles, workspaces } from './workspaces'

export const googleCalendarEvents = pgTable('google_calendar_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  googleCalendarId: text('google_calendar_id').notNull(),
  googleEventId: text('google_event_id').notNull(),
  title: text('title').notNull(),
  // all-day events: YYYY-MM-DD (Googleの exclusive endDate を -1日して inclusive に変換済み)
  startDate: text('start_date'),
  endDate: text('end_date'),
  isAllDay: boolean('is_all_day').notNull().default(false),
  description: text('description'),
  calendarName: text('calendar_name'),
  calendarColor: text('calendar_color'),
  htmlLink: text('html_link'),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
})
