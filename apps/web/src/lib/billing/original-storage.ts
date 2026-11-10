// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { creditLedger, subscriptions } from '@cairn/db'
import { and, eq, gt, sql } from 'drizzle-orm'
import { isBillingEnabled } from './is-billing-enabled'
import { settleWorkspaceStorageRent, type StorageRentTransaction } from './storage-rent'

export const ORIGINAL_UPLOAD_ENTITLEMENT_ERROR = 'original-upload-entitlement-required'

/**
 * 原本（家賃対象）を登録する直前に、usage 行をロックして未請求家賃を精算した後の
 * 残高・本人の支援状態を確認する。満たさなければ ORIGINAL_UPLOAD_ENTITLEMENT_ERROR を投げる。
 * トランザクションの外での事前判定（resolveUploadEntitlements）だけに依存しないために使う。
 */
export async function assertOriginalStorageAllowed(
  tx: StorageRentTransaction,
  workspaceId: string,
  userId: string,
): Promise<void> {
  if (!isBillingEnabled()) return
  await settleWorkspaceStorageRent(tx, workspaceId)
  const [[balance], [subscription]] = await Promise.all([
    tx
      .select({ balance: sql<string>`COALESCE(SUM(${creditLedger.delta}), 0)` })
      .from(creditLedger)
      .where(eq(creditLedger.workspaceId, workspaceId)),
    tx
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.workspaceId, workspaceId),
          eq(subscriptions.supporterUserId, userId),
          eq(subscriptions.plan, 'individual'),
          eq(subscriptions.status, 'active'),
          gt(subscriptions.currentPeriodEnd, new Date()),
        ),
      )
      .limit(1),
  ])
  if (!subscription || Number(balance?.balance ?? 0) <= 0) {
    throw new Error(ORIGINAL_UPLOAD_ENTITLEMENT_ERROR)
  }
}
