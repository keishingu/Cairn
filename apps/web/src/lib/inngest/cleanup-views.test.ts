// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

const { handlers, captured } = vi.hoisted(() => ({
  handlers: new Map<string, (args: { step: { run: (name: string, fn: () => unknown) => Promise<unknown> } }) => Promise<unknown>>(),
  captured: { condition: undefined as unknown },
}))
vi.mock('./client', () => ({ inngest: {
  createFunction: (options: { id: string }, _trigger: unknown, handler: never) => { handlers.set(options.id, handler); return {} },
  send: vi.fn(),
} }))
vi.mock('@cairn/db', async () => {
  const { pgTable, text, timestamp } = await import('drizzle-orm/pg-core')
  const appViews = pgTable('app_views', {
    id: text('id'), status: text('status'), updatedAt: timestamp('updated_at'), submittingUntil: timestamp('submitting_until'),
  })
  return { appViews, db: { delete: () => ({ where: (condition: unknown) => {
    captured.condition = condition
    return { returning: async () => [] }
  } }) } }
})
import './functions'

describe('アプリモーダルのクリーンアップ', () => {
  test('古い全状態を対象とし送信中の確保を除外する', async () => {
    const handler = handlers.get('cleanup-app-interaction-deliveries')!
    await handler({ step: { run: async (name, fn) => name === 'delete-finished-views' ? fn() : 0 } })
    const query = new PgDialect().sqlToQuery(captured.condition as import('drizzle-orm').SQL)
    expect(query.params).toEqual(['open', 'submitted', 'closed'])
    expect(query.sql).toContain('"app_views"."updated_at" < now() - interval \'30 days\'')
    expect(query.sql).toContain('"app_views"."submitting_until" is null')
    expect(query.sql).toContain('"app_views"."submitting_until" < now()')
  })
})
