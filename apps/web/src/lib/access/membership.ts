// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// workspace membership を「認可目的で読む」唯一の入口。
// authz のために workspace_members を直接 join せず、この module（と
// active_workspace_members ビュー）を経由することで、非活性メンバーの絞り込みを
// 各所で書き忘れる余地を構造的に無くす。新しい read path を足すときは必ずここを通す。

import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { db, activeWorkspaceMembers } from '@cairn/db'
import { and, eq, inArray } from 'drizzle-orm'

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest'

const ROLE_RANK: Record<WorkspaceRole, number> = { guest: 0, member: 1, admin: 2, owner: 3 }
const requestRoleCache = new WeakMap<object, Map<string, Promise<WorkspaceRole | null>>>()

// 判定 helper は string | null 契約を維持する（呼び出し側の role 型ゆらぎを吸収）。
export function isWorkspaceOwner(role: string | null): boolean {
  return role === 'owner'
}
export function isWorkspaceAdmin(role: string | null): boolean {
  return role === 'owner' || role === 'admin'
}
export function isWorkspaceMember(role: string | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'member'
}

// active membership のみロールを返す（非活性・非所属は null）。
// active_workspace_members ビュー由来のため、ここで membership_status = 'active' を
// 書く必要はない（ビュー定義が保証する）。role 参照系（require* / requireProjectAccess /
// requireChannelAccess / canAccessFile）はすべてこの関数を通るため、これ 1 箇所を
// active 限定にするだけで非活性メンバーが横断的に 403 になる。
async function fetchWorkspaceRole(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceRole | null> {
  const fetchRole = async () => {
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

  try {
    const requestHeaders = await headers()
    const cacheKey = `${workspaceId}:${userId}`
    let roleCache = requestRoleCache.get(requestHeaders)
    if (!roleCache) {
      roleCache = new Map<string, Promise<WorkspaceRole | null>>()
      requestRoleCache.set(requestHeaders, roleCache)
    }
    const cached = roleCache.get(cacheKey)
    if (cached) {
      return cached
    }
    const pending = fetchRole()
    roleCache.set(cacheKey, pending)
    return pending
  } catch {
    return fetchRole()
  }
}

export async function getWorkspaceRole(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceRole | null> {
  try {
    const requestHeaders = await headers()
    const cacheKey = `${workspaceId}:${userId}`
    let roleCache = requestRoleCache.get(requestHeaders)
    if (!roleCache) {
      roleCache = new Map<string, Promise<WorkspaceRole | null>>()
      requestRoleCache.set(requestHeaders, roleCache)
    }
    const cached = roleCache.get(cacheKey)
    if (cached) {
      return cached
    }
    const pending = fetchWorkspaceRole(workspaceId, userId)
    roleCache.set(cacheKey, pending)
    return pending
  } catch {
    return fetchWorkspaceRole(workspaceId, userId)
  }
}

// 既存 import 互換のエイリアス
export async function getWorkspaceMemberRole(workspaceId: string, userId: string) {
  return getWorkspaceRole(workspaceId, userId)
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

// workspace の owner のみ許可（WS名・ロゴ等の設定変更）
export function requireWorkspaceOwner(workspaceId: string, userId: string) {
  return requireActiveMember(workspaceId, userId, 'owner')
}
// workspace の admin または owner のみ許可（メンバー管理・プロジェクト作成削除・ゲスト招待）
export function requireWorkspaceAdmin(workspaceId: string, userId: string) {
  return requireActiveMember(workspaceId, userId, 'admin')
}
// workspace の member 以上（owner/admin/member）を許可。guest は不可
export function requireWorkspaceMember(workspaceId: string, userId: string) {
  return requireActiveMember(workspaceId, userId, 'member')
}

// active membership かどうかの真偽判定（role を問わない）。
export async function isActiveWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  return (await getWorkspaceRole(workspaceId, userId)) !== null
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
