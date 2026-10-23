// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import {
  resolveUploadRights,
  resolveWorkspaceState,
  type UploadRights,
  type WorkspaceState,
} from '@cairn/core/billing'
import { creditLedger, db, subscriptions } from '@cairn/db'
import { and, eq, gt, sql } from 'drizzle-orm'
import { isBillingEnabled } from './is-billing-enabled'

export interface UploadEntitlements {
  workspaceState: WorkspaceState
  creditBalance: number
  isActiveSupporter: boolean
  rights: UploadRights
}

/**
 * アップロード時点の支援状態と残高を解決する。
 * Phase 1 は個人購読だけを対象にし、将来のワークスペース定額はここへ追加する。
 */
export async function resolveUploadEntitlements(
  workspaceId: string,
  userId: string,
): Promise<UploadEntitlements> {
  const billingEnabled = isBillingEnabled()
  if (!billingEnabled) {
    return {
      workspaceState: resolveWorkspaceState(0, false),
      creditBalance: 0,
      isActiveSupporter: true,
      rights: resolveUploadRights(false, true, false),
    }
  }

  const [[balance], [subscription]] = await Promise.all([
    db
      .select({ balance: sql<string>`COALESCE(SUM(${creditLedger.delta}), 0)` })
      .from(creditLedger)
      .where(eq(creditLedger.workspaceId, workspaceId)),
    db
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

  const creditBalance = Number(balance?.balance ?? 0)
  const workspaceState = resolveWorkspaceState(creditBalance, true)
  return {
    workspaceState,
    creditBalance,
    isActiveSupporter: subscription !== undefined,
    rights: resolveUploadRights(subscription !== undefined, workspaceState === 'funded', true),
  }
}
