// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { db, workspaceMembers } from '@cairn/db'
import { eq, and } from 'drizzle-orm'

async function getWorkspaceRole(workspaceId: string, userId: string) {
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1)
  return member?.role ?? null
}

export function isWorkspaceOwner(role: string | null): boolean {
  return role === 'owner'
}

export function isWorkspaceAdmin(role: string | null): boolean {
  return role === 'owner' || role === 'admin'
}

export function isWorkspaceMember(role: string | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'member'
}

export async function getWorkspaceMemberRole(workspaceId: string, userId: string) {
  return getWorkspaceRole(workspaceId, userId)
}

// workspace の owner のみ許可（WS名・ロゴ等の設定変更）
export async function requireWorkspaceOwner(
  workspaceId: string,
  userId: string,
): Promise<NextResponse | null> {
  const role = await getWorkspaceRole(workspaceId, userId)
  if (!isWorkspaceOwner(role)) {
    return NextResponse.json({ error: 'この操作にはオーナー権限が必要です' }, { status: 403 })
  }
  return null
}

// workspace の admin または owner のみ許可（メンバー管理・プロジェクト作成削除・ゲスト招待）
export async function requireWorkspaceAdmin(
  workspaceId: string,
  userId: string,
): Promise<NextResponse | null> {
  const role = await getWorkspaceRole(workspaceId, userId)
  if (!isWorkspaceAdmin(role)) {
    return NextResponse.json({ error: 'この操作には管理者以上の権限が必要です' }, { status: 403 })
  }
  return null
}

// workspace の member 以上（owner/admin/member）を許可。guest は不可（プロジェクト編集・メンバー追加削除）
export async function requireWorkspaceMember(
  workspaceId: string,
  userId: string,
): Promise<NextResponse | null> {
  const role = await getWorkspaceRole(workspaceId, userId)
  if (!isWorkspaceMember(role)) {
    return NextResponse.json({ error: 'ゲストはこの操作を実行できません' }, { status: 403 })
  }
  return null
}
