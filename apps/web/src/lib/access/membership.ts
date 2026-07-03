// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// workspace membership を「認可目的で読む」唯一の入口。
// workspace_members を直接 join せず、この module（と active_workspace_members ビュー）を
// 経由することで、非活性メンバーの絞り込みを各所で書き忘れる余地を無くす。
// 新しい read path を足すときは、必ずここの helper を通すこと。

import { NextResponse } from 'next/server'
import { db, activeWorkspaceMembers } from '@cairn/db'
import { and, eq, inArray } from 'drizzle-orm'

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest'

const ROLE_RANK: Record<WorkspaceRole, number> = { guest: 0, member: 1, admin: 2, owner: 3 }

// 判定 helper は従来の string | null 契約を維持する（呼び出し側の型ゆらぎを吸収）。
export function isWorkspaceOwner(role: string | null): boolean {
  return role === 'owner'
}
export function isWorkspaceAdmin(role: string | null): boolean {
  return role === 'owner' || role === 'admin'
}
export function isWorkspaceMember(role: string | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'member'
}

// active membership のみロールを返す（非活性は null）。active_workspace_members ビュー由来のため、
// ここで `membership_status = 'active'` を書く必要はない（ビュー定義が保証する）。
export async function getWorkspaceRole(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceRole | null> {
  const [member] = await db
    .select({ role: activeWorkspaceMembers.role })
    .from(activeWorkspaceMembers)
    .where(and(
      eq(activeWorkspaceMembers.workspaceId, workspaceId),
      eq(activeWorkspaceMembers.userId, userId),
    ))
    .limit(1)
  return member?.role ?? null
}

const ROLE_ERROR: Record<WorkspaceRole, string> = {
  owner: 'この操作にはオーナー権限が必要です',
  admin: 'この操作には管理者以上の権限が必要です',
  member: 'ゲストはこの操作を実行できません',
  guest: 'このワークスペースにアクセスする権限がありません',
}

// active membership かつ指定 role 以上を要求する。満たさなければ 403 を返す。
export async function requireActiveMember(
  workspaceId: string,
  userId: string,
  min: WorkspaceRole,
): Promise<NextResponse | null> {
  const role = await getWorkspaceRole(workspaceId, userId)
  if (role === null || ROLE_RANK[role] < ROLE_RANK[min]) {
    return NextResponse.json({ error: ROLE_ERROR[min] }, { status: 403 })
  }
  return null
}

// ワークスペースの active メンバー ID 一覧。一覧・候補系がこれを共有する。
export async function listActiveMemberIds(workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: activeWorkspaceMembers.userId })
    .from(activeWorkspaceMembers)
    .where(eq(activeWorkspaceMembers.workspaceId, workspaceId))
  return rows.map((r) => r.userId)
}

// 与えた userId 集合のうち、当該ワークスペースで active な ID だけを残す。
// 通知配信・メンション補完などが「stale な派生行に紐づく非活性ユーザー」を除外するのに使う。
export async function filterActiveMemberIds(
  workspaceId: string,
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const rows = await db
    .select({ userId: activeWorkspaceMembers.userId })
    .from(activeWorkspaceMembers)
    .where(and(
      eq(activeWorkspaceMembers.workspaceId, workspaceId),
      inArray(activeWorkspaceMembers.userId, userIds),
    ))
  return new Set(rows.map((r) => r.userId))
}
