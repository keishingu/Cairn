// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { aiScopeEnum } from './enums'
import { profiles, workspaces } from './workspaces'
import { projects } from './projects'

export const aiAgents = pgTable('ai_agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  scope: aiScopeEnum('scope').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  model: text('model').notNull(),
  systemPrompt: text('system_prompt'),
  agentsMd: text('agents_md'),
  htmlTemplate: text('html_template'),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => aiAgents.id, { onDelete: 'cascade' }),
    title: text('title'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_ai_conversations_workspace').on(t.workspaceId)],
)

export const aiMessages = pgTable('ai_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => aiConversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  annotations: jsonb('annotations').$type<unknown[]>(),
  toolInvocations: jsonb('tool_invocations').$type<unknown[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
