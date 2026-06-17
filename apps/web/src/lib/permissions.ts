// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { db, workspaceMembers, channels, channelMembers, projects } from '@cairn/db'
import { eq, and, sql } from 'drizzle-orm'

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

// チャンネルへのアクセス可否を検証する。
// - 指定ワークスペースに属さないチャンネルは 403（チャンネルID総当たりによる越境アクセスを防ぐ）
//   旧データのプロジェクトチャンネルは channels.workspace_id が null のことがあるため、
//   project の workspace_id にフォールバックして判定する（migration 0033 と同じ coalesce）。
// - プライベートチャンネルと DM は channel_members に参加しているユーザーのみ許可。
//   DM は is_private=false でも参加者を channel_members で管理するため、type も判定に含める。
// アクセス可なら null、不可なら 403 の NextResponse を返す。
export async function requireChannelAccess(
  workspaceId: string,
  userId: string,
  channelId: string,
): Promise<NextResponse | null> {
  const [channel] = await db
    .select({
      isPrivate: channels.isPrivate,
      type: channels.type,
      effectiveWorkspaceId: sql<string | null>`coalesce(${channels.workspaceId}, ${projects.workspaceId})`,
    })
    .from(channels)
    .leftJoin(projects, eq(channels.projectId, projects.id))
    .where(eq(channels.id, channelId))
    .limit(1)

  if (!channel || channel.effectiveWorkspaceId !== workspaceId) {
    return NextResponse.json({ error: 'このチャンネルにアクセスする権限がありません' }, { status: 403 })
  }

  const membersOnly = channel.isPrivate || channel.type === 'dm'
  if (membersOnly) {
    const [membership] = await db
      .select({ userId: channelMembers.userId })
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)))
      .limit(1)

    if (!membership) {
      return NextResponse.json({ error: 'このチャンネルにアクセスする権限がありません' }, { status: 403 })
    }
  }

  return null
}
