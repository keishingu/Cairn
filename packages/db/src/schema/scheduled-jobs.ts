// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { channels } from './channels'
import { profiles, workspaces } from './workspaces'

export interface ScheduledJobMonthlySchedule {
  type: 'monthly'
  dayOfMonth: number
  hour: number
  minute: number
}

export interface ScheduledJobMention {
  userId: string
  displayName: string
}

export interface ScheduledJobActionSpec {
  type: 'poll'
  prompt: string
  choicesPrompt: string
  allowMultiple: boolean
  anonymous: boolean
}

export const scheduledJobs = pgTable(
  'scheduled_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull().default(true),
    rawInstruction: text('raw_instruction').notNull(),
    timezone: text('timezone').notNull().default('Asia/Tokyo'),
    schedule: jsonb('schedule').$type<ScheduledJobMonthlySchedule>().notNull(),
    mentionUserIds: jsonb('mention_user_ids').$type<string[]>().notNull().default([]),
    mentions: jsonb('mentions').$type<ScheduledJobMention[]>().notNull().default([]),
    actionSpec: jsonb('action_spec').$type<ScheduledJobActionSpec>().notNull(),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    lastCompiledAt: timestamp('last_compiled_at', { withTimezone: true }).notNull().defaultNow(),
    lastCompilePreview: text('last_compile_preview').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_scheduled_jobs_workspace_enabled_next_run').on(t.workspaceId, t.enabled, t.nextRunAt),
  ],
)

export const scheduledJobRuns = pgTable(
  'scheduled_job_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => scheduledJobs.id, { onDelete: 'cascade' }),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    statusCode: integer('status_code'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.jobId, t.scheduledFor),
    index('idx_scheduled_job_runs_job_created').on(t.jobId, t.createdAt),
  ],
)
