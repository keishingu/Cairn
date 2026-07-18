// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { db, channels, channelMembers, projects, projectMembers, messages, messageAttachments } from '@cairn/db'
import { eq, and, sql, inArray } from 'drizzle-orm'
import { getWorkspaceRole, isWorkspaceMember, type WorkspaceRole } from './access/membership'

// role の解決・判定・active 要求は access/membership に一元化した（active_workspace_members
// ビュー経由で非活性メンバーを構造的に除外し、role 参照系がすべて非活性を 403 で弾く）。
// 既存 import 互換のためここから re-export する。
export {
  getWorkspaceRole,
  getWorkspaceMemberRole,
  isWorkspaceOwner,
  isWorkspaceAdmin,
  isWorkspaceMember,
  requireRole,
  requireWorkspaceOwner,
  requireWorkspaceAdmin,
  requireWorkspaceMember,
} from './access/membership'
export type { WorkspaceRole } from './access/membership'

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
  // getAuthContext 取得済みの role（ctx.role）を渡すと、内部の getWorkspaceRole を省く。
  // 未指定なら従来通り DB から解決する（後方互換）。
  knownRole?: WorkspaceRole | null,
): Promise<NextResponse | null> {
  const role = knownRole !== undefined ? knownRole : await getWorkspaceRole(workspaceId, userId)
  if (isWorkspaceMember(role)) return null

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
  // ctx.role を渡すとゲスト判定時の getWorkspaceRole を省く（未指定なら DB 解決）
  knownRole?: WorkspaceRole | null,
): Promise<NextResponse | null> {
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
    const role = knownRole !== undefined ? knownRole : await getWorkspaceRole(workspaceId, userId)
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
  // ctx.role を渡すと内部の getWorkspaceRole を省く（未指定なら DB 解決）
  knownRole?: WorkspaceRole | null,
): Promise<boolean> {
  if (file.workspaceId !== workspaceId) return false
  if (file.uploadedBy === userId) return true

  const role = knownRole !== undefined ? knownRole : await getWorkspaceRole(workspaceId, userId)
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

  // metadata.channelIds（新形式の配列）と旧形式の単一 metadata.channelId の両方を見る
  const meta = (file.metadata ?? {}) as Record<string, unknown>
  const metadataChannelIds = new Set<string>()
  const legacyChannelId = meta['channelId']
  if (typeof legacyChannelId === 'string') metadataChannelIds.add(legacyChannelId)
  const channelIdsArr = meta['channelIds']
  if (Array.isArray(channelIdsArr)) {
    for (const id of channelIdsArr) if (typeof id === 'string') metadataChannelIds.add(id)
  }

  // メッセージ添付ファイル: 添付先チャンネルのいずれかにアクセスできれば可
  const attached = await db
    .selectDistinct({ channelId: messages.channelId })
    .from(messageAttachments)
    .innerJoin(messages, eq(messageAttachments.messageId, messages.id))
    .where(eq(messageAttachments.fileId, file.id))

  // 全候補チャンネルを一括チェック（N+1 を避けるため requireChannelAccess をループで呼ばない）
  const allCandidateChannelIds = [...new Set([...metadataChannelIds, ...attached.map(r => r.channelId)])]
  if (allCandidateChannelIds.length === 0) return false

  return canAccessViaAnyChannel(workspaceId, userId, role, allCandidateChannelIds)
}

// 指定チャンネル群のうち少なくとも1つにアクセスできるか一括チェックする。
// requireChannelAccess をループで呼ぶ N+1 を避けるため、チャンネルメタデータと
// メンバーシップを2回のバッチクエリで取得して評価する。
async function canAccessViaAnyChannel(
  workspaceId: string,
  userId: string,
  role: string | null,
  channelIds: string[],
): Promise<boolean> {
  const channelRows = await db
    .select({
      id: channels.id,
      isPrivate: channels.isPrivate,
      type: channels.type,
      projectId: channels.projectId,
      effectiveWorkspaceId: sql<string | null>`coalesce(${channels.workspaceId}, ${projects.workspaceId})`,
    })
    .from(channels)
    .leftJoin(projects, eq(channels.projectId, projects.id))
    .where(inArray(channels.id, channelIds))

  const wsChannels = channelRows.filter(c => c.effectiveWorkspaceId === workspaceId)
  if (wsChannels.length === 0) return false

  const isGuest = role === 'guest'

  // member以上: 非プライベート・非DMチャンネルが1つでもあれば即時許可
  if (!isGuest && wsChannels.some(c => !c.isPrivate && c.type !== 'dm')) return true

  // guest: 非プライベート・非DM・非プロジェクトの一般ワークスペースチャンネルは即時許可
  // requireChannelAccess はゲストの一般チャンネルを制限しない
  if (isGuest && wsChannels.some(c => !c.isPrivate && c.type !== 'dm' && c.type !== 'project')) return true

  // プライベートまたはDMはチャンネルメンバーシップが必要
  const needsChannelCheck = wsChannels.filter(c => c.isPrivate || c.type === 'dm')
  // ゲストのプロジェクトチャンネルはプロジェクトメンバーシップが必要（open/private 両方）
  const guestProjectChannels = isGuest ? wsChannels.filter(c => c.type === 'project' && c.projectId) : []
  const guestProjectIds = [...new Set(guestProjectChannels.map(c => c.projectId!))]

  if (needsChannelCheck.length === 0 && guestProjectIds.length === 0) return false

  const [membershipRows, projectMemberRows] = await Promise.all([
    needsChannelCheck.length > 0
      ? db
          .select({ channelId: channelMembers.channelId })
          .from(channelMembers)
          .where(and(eq(channelMembers.userId, userId), inArray(channelMembers.channelId, needsChannelCheck.map(c => c.id))))
      : Promise.resolve([]),
    guestProjectIds.length > 0
      ? db
          .select({ projectId: projectMembers.projectId })
          .from(projectMembers)
          .where(and(eq(projectMembers.userId, userId), inArray(projectMembers.projectId, guestProjectIds)))
      : Promise.resolve([]),
  ])

  // member以上: プライベート/DMチャンネルのいずれかのメンバーであれば許可
  if (!isGuest) return membershipRows.length > 0

  // guest: チャンネルごとに requireChannelAccess と同じ条件で評価する
  const joinedChannelIds = new Set(membershipRows.map(r => r.channelId))
  const joinedProjectIds = new Set(projectMemberRows.map(r => r.projectId))

  for (const ch of wsChannels) {
    if (ch.type === 'project' && ch.projectId) {
      if (ch.isPrivate) {
        // プライベートプロジェクトチャンネル: チャンネルメンバーシップ AND プロジェクトメンバーシップ
        if (joinedChannelIds.has(ch.id) && joinedProjectIds.has(ch.projectId)) return true
      } else {
        // 非プライベートプロジェクトチャンネル: プロジェクトメンバーシップのみ
        if (joinedProjectIds.has(ch.projectId)) return true
      }
    } else if (ch.isPrivate || ch.type === 'dm') {
      // プライベート/DM（非プロジェクト）: チャンネルメンバーシップのみ
      if (joinedChannelIds.has(ch.id)) return true
    }
    // 非プライベート・非DM・非プロジェクト: 上の early return で処理済み
  }

  return false
}
