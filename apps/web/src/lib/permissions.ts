// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { db, workspaceMembers, channels, channelMembers, projects, projectMembers, messages, messageAttachments } from '@cairn/db'
import { eq, and, sql } from 'drizzle-orm'

export async function getWorkspaceRole(workspaceId: string, userId: string) {
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, userId),
      eq(workspaceMembers.membershipStatus, 'active'),
    ))
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

// ゲストがアクセス可能なプロジェクトID集合（project_members に行があるプロジェクト）を返す。
// member 以上はワークスペース全体を参照できるため、この関数はゲストの可視範囲を絞る用途で使う。
export async function getGuestVisibleProjectIds(
  workspaceId: string,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(and(eq(projectMembers.userId, userId), eq(projects.workspaceId, workspaceId)))
  return [...new Set(rows.map(r => r.projectId))]
}

// 指定プロジェクトへのアクセス可否を検証する。
// member 以上は常に許可。guest は project_members に行があり、かつそのプロジェクトが
// 当該ワークスペースに属する場合のみ許可する（別ワークスペースのプロジェクトメンバーによる
// 越境書き込みを防ぐため projects.workspaceId も検証する）。無ければ 403。
export async function requireProjectAccess(
  workspaceId: string,
  userId: string,
  projectId: string,
): Promise<NextResponse | null> {
  const role = await getWorkspaceRole(workspaceId, userId)
  if (isWorkspaceMember(role)) return null
  if (role !== 'guest') {
    return NextResponse.json(
      { error: 'このプロジェクトにアクセスする権限がありません' },
      { status: 403 },
    )
  }

  const [membership] = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(and(
      eq(projectMembers.projectId, projectId),
      eq(projectMembers.userId, userId),
      eq(projects.workspaceId, workspaceId),
    ))
    .limit(1)

  if (!membership) {
    return NextResponse.json(
      { error: 'このプロジェクトにアクセスする権限がありません' },
      { status: 403 },
    )
  }
  return null
}

// チャンネルへのアクセス可否を検証する。
// - 指定ワークスペースに属さないチャンネルは 403（チャンネルID総当たりによる越境アクセスを防ぐ）
//   旧データのプロジェクトチャンネルは channels.workspace_id が null のことがあるため、
//   project の workspace_id にフォールバックして判定する（migration 0033 と同じ coalesce）。
// - プライベートチャンネルと DM は channel_members に参加しているユーザーのみ許可。
//   DM は is_private=false でも参加者を channel_members で管理するため、type も判定に含める。
// - プロジェクトチャンネルはゲストの場合、参加プロジェクト（project_members）のみ許可。
//   非プライベートでもゲストが参加外プロジェクトのチャットを閲覧/投稿できないようにする。
// アクセス可なら null、不可なら 403 の NextResponse を返す。
export async function requireChannelAccess(
  workspaceId: string,
  userId: string,
  channelId: string,
): Promise<NextResponse | null> {
  const role = await getWorkspaceRole(workspaceId, userId)
  if (!isWorkspaceMember(role) && role !== 'guest') {
    return NextResponse.json({ error: 'このチャンネルにアクセスする権限がありません' }, { status: 403 })
  }

  const [channel] = await db
    .select({
      isPrivate: channels.isPrivate,
      type: channels.type,
      projectId: channels.projectId,
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

  // プロジェクトチャンネルはゲストの場合、参加プロジェクトに限定する
  if (channel.type === 'project' && channel.projectId) {
    if (role === 'guest') {
      const [pm] = await db
        .select({ id: projectMembers.id })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, channel.projectId), eq(projectMembers.userId, userId)))
        .limit(1)

      if (!pm) {
        return NextResponse.json({ error: 'このチャンネルにアクセスする権限がありません' }, { status: 403 })
      }
    }
  }

  return null
}

export interface FileAccessRow {
  id: string
  workspaceId: string
  projectId: string | null
  uploadedBy: string
  metadata?: unknown
}

// ファイル単体の閲覧可否を判定する。`requireChannelAccess` と同じスコープ感で、
// ワークスペース所属だけを根拠にした越境アクセス（fileID 総当たり）を防ぐ。
// - 別ワークスペースのファイルは不可
// - アップロード者本人は常に可（メッセージ投稿前のアップロード直後も閲覧できる）
// - プロジェクトファイルは member 以上なら可、guest は参加プロジェクトのみ
// - メッセージ添付ファイルは、添付先チャンネルのいずれかにアクセスできれば可
// - それ以外（未添付かつ非プロジェクトの他人のファイル）は不可
export async function canAccessFile(
  workspaceId: string,
  userId: string,
  file: FileAccessRow,
): Promise<boolean> {
  if (file.workspaceId !== workspaceId) return false
  if (file.uploadedBy === userId) return true

  const role = await getWorkspaceRole(workspaceId, userId)
  // ワークスペース非所属（role なし）は不可
  if (!isWorkspaceMember(role) && role !== 'guest') return false

  // プロジェクトファイル: member 以上は全件可、guest は参加プロジェクトのみ
  if (file.projectId) {
    if (role !== 'guest') return true
    const [pm] = await db
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, file.projectId), eq(projectMembers.userId, userId)))
      .limit(1)
    if (pm) return true
    // プロジェクト未参加のゲストでも、添付経由でアクセスできる場合があるため後段で判定する
  }

  const meta = (file.metadata ?? {}) as Record<string, unknown>
  const metadataChannelId = meta['channelId']
  if (typeof metadataChannelId === 'string') {
    const forbidden = await requireChannelAccess(workspaceId, userId, metadataChannelId)
    if (!forbidden) return true
  }

  // メッセージ添付ファイル: 添付先チャンネルのいずれかにアクセスできれば可
  const attached = await db
    .selectDistinct({ channelId: messages.channelId })
    .from(messageAttachments)
    .innerJoin(messages, eq(messageAttachments.messageId, messages.id))
    .where(eq(messageAttachments.fileId, file.id))

  for (const { channelId } of attached) {
    const forbidden = await requireChannelAccess(workspaceId, userId, channelId)
    if (!forbidden) return true
  }

  return false
}
