// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// membership のライフサイクル（活性 ⇄ 非活性）状態遷移を 1 箇所に集約する。
// 「非活性化＝当該 WS の未所属化」という不変条件（最後の active owner を残す等）を
// ここで担保し、呼び出し側（API）は認可とディスパッチだけを行う。
// 再活性化で profiles には触れないため、同一アイデンティティ・履歴のまま復帰できる。

import { db, workspaceMembers, activeWorkspaceMembers } from '@cairn/db'
import { and, count, eq } from 'drizzle-orm'

export type LifecycleResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

async function readMembership(workspaceId: string, userId: string) {
  const [row] = await db
    .select({ role: workspaceMembers.role, membershipStatus: workspaceMembers.membershipStatus })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1)
  return row ?? null
}

async function countActiveOwners(workspaceId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(activeWorkspaceMembers)
    .where(and(eq(activeWorkspaceMembers.workspaceId, workspaceId), eq(activeWorkspaceMembers.role, 'owner')))
  return Number(rows[0]?.n ?? 0)
}

// メンバーを非活性化する（卒業生化）。既に非活性なら 422。
// 最後の active な owner は非活性化できない（ワークスペースが owner を失うため）。
export async function deactivateMembership(
  workspaceId: string,
  targetUserId: string,
  deactivatedBy: string,
): Promise<LifecycleResult> {
  const target = await readMembership(workspaceId, targetUserId)
  if (!target) return { ok: false, status: 404, error: 'Member not found' }
  if (target.membershipStatus === 'inactive') {
    return { ok: false, status: 422, error: 'このメンバーは既に非活性です' }
  }

  if (target.role === 'owner' && (await countActiveOwners(workspaceId)) <= 1) {
    return { ok: false, status: 422, error: 'ワークスペースには最低1人の active な owner が必要です' }
  }

  await db
    .update(workspaceMembers)
    .set({ membershipStatus: 'inactive', deactivatedAt: new Date(), deactivatedBy })
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetUserId)))

  return { ok: true }
}

// 非活性メンバーを再活性化する（同一アイデンティティ・所属・履歴のまま復帰）。既に活性なら 422。
export async function reactivateMembership(
  workspaceId: string,
  targetUserId: string,
): Promise<LifecycleResult> {
  const target = await readMembership(workspaceId, targetUserId)
  if (!target) return { ok: false, status: 404, error: 'Member not found' }
  if (target.membershipStatus === 'active') {
    return { ok: false, status: 422, error: 'このメンバーは既に活性です' }
  }

  await db
    .update(workspaceMembers)
    .set({ membershipStatus: 'active', deactivatedAt: null, deactivatedBy: null })
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetUserId)))

  return { ok: true }
}

// 招待受け入れ時に既存の非活性メンバーシップがあれば再活性化して同一性を保つ。
// 戻り値: 'reactivated'（非活性→活性に戻した）/ 'already-active'（既に活性）/ 'none'（メンバーシップ無し）。
// 同一メールでの再 invite を「新規行の作成」ではなく「復帰」にするため（設計 §8-2 の決定）。
export async function reactivateViaInvite(
  workspaceId: string,
  userId: string,
  role?: 'owner' | 'admin' | 'member' | 'guest',
): Promise<'reactivated' | 'already-active' | 'none'> {
  const existing = await readMembership(workspaceId, userId)
  if (!existing) return 'none'
  if (existing.membershipStatus === 'active') return 'already-active'

  await db
    .update(workspaceMembers)
    .set({ membershipStatus: 'active', deactivatedAt: null, deactivatedBy: null, ...(role ? { role } : {}) })
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))

  return 'reactivated'
}
