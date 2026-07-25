// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { bigint, index, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { billingPlanEnum, creditLedgerReasonEnum, subscriptionStatusEnum } from './enums'
import { profiles, workspaces } from './workspaces'

// Stripe 顧客とアプリケーションユーザーを 1:1 で対応付ける。
// 顧客は複数のワークスペースを支援できるため、workspace_id は持たせない。
export const billingCustomers = pgTable('billing_customers', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => profiles.id),
  stripeCustomerId: text('stripe_customer_id').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// 支援者が退会・非活性化しても過去の支援記録を失わないよう、supporter_user_id は cascade しない。
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    supporterUserId: uuid('supporter_user_id')
      .notNull()
      .references(() => profiles.id),
    plan: billingPlanEnum('plan').notNull(),
    stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
    quantity: integer('quantity').notNull().default(1),
    status: subscriptionStatusEnum('status').notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_subscriptions_workspace_status').on(t.workspaceId, t.status),
    index('idx_subscriptions_supporter_status').on(t.supporterUserId, t.status),
  ],
)

// 残高はこの台帳の delta 合計から導出する。直接更新する残高カラムは持たない。
export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    delta: integer('delta').notNull(),
    reason: creditLedgerReasonEnum('reason').notNull(),
    refId: text('ref_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_credit_ledger_workspace_created').on(t.workspaceId, t.createdAt),
    // 同一の外部イベント・家賃期間を二重記帳しないための業務キー。
    uniqueIndex('credit_ledger_workspace_reason_ref_unique').on(t.workspaceId, t.reason, t.refId),
  ],
)

// 付与クレジットを画面上に配置した結果。台帳行と 1:1 にし、同じ付与を二重に配置できないようにする。
// placed_by はメンバーの非活性化・退会後にも履歴を残すため cascade しない。
export const creditPlacements = pgTable(
  'credit_placements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ledgerId: uuid('ledger_id')
      .notNull()
      .references(() => creditLedger.id, { onDelete: 'cascade' }),
    placedBy: uuid('placed_by')
      .notNull()
      .references(() => profiles.id),
    x: numeric('x', { precision: 8, scale: 6 }).notNull(),
    y: numeric('y', { precision: 8, scale: 6 }).notNull(),
    rotation: numeric('rotation', { precision: 8, scale: 6 }).notNull(),
    shape: text('shape').notNull().default('regular'),
    placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('credit_placements_ledger_unique').on(t.ledgerId),
    index('idx_credit_placements_workspace_placed').on(t.workspaceId, t.placedAt),
  ],
)

// アップロードの執行と家賃計算に使う使用量カウンタ。
// files の CASCADE 削除などでずれることを前提に、定期的な reconciliation で再計算する。
export const workspaceStorageUsage = pgTable('workspace_storage_usage', {
  workspaceId: uuid('workspace_id')
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  originalBytes: bigint('original_bytes', { mode: 'number' }).notNull().default(0),
  derivedBytes: bigint('derived_bytes', { mode: 'number' }).notNull().default(0),
  // 日割り家賃の小数端数。整数クレジットとして台帳へ記帳するまでここに繰り越す。
  unbilledRentCredits: numeric('unbilled_rent_credits', { precision: 20, scale: 8 })
    .notNull()
    .default('0'),
  lastRentAt: timestamp('last_rent_at', { withTimezone: true }).notNull().defaultNow(),
  lastReconciledAt: timestamp('last_reconciled_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Stripe の event id を処理済みとして記録し、Webhook の再送を冪等にする。
export const stripeEvents = pgTable('stripe_events', {
  eventId: text('event_id').primaryKey(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
})
