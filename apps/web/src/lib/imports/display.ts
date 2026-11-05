// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * 取り込んだメッセージの表示用情報。messages.sender_id は共通の「取り込み」プロフィールなので、
 * 本当の投稿者（取り込み元の名前、または管理者が紐づけた Cairn ユーザー）をここで引いて上書きする。
 */

export type ImportedIdentityKind = 'exporter' | 'named' | 'unnamed-participant' | 'anonymous'

export interface ImportedMessageInfoDto {
  source: string
  /** 取り込み元での投稿日時（messages.created_at と同じ） */
  originalSentAt: string
  /** 投稿者不明 */
  anonymous: boolean
  identityKind: ImportedIdentityKind
  /** 取り込み元の表示名（分からなければ null） */
  originalName: string | null
  /** 管理者が紐づけた Cairn ユーザー */
  linkedUserId: string | null
}

export interface ImportedSender {
  name: string
  avatarUrl: string | null
  info: ImportedMessageInfoDto
}

/** 名前が分からない投稿者の表示名（UI は identityKind から翻訳し直す。アプリはこの文字列をそのまま出す） */
export function fallbackImportedName(kind: ImportedIdentityKind): string {
  switch (kind) {
    case 'anonymous': return '投稿者不明'
    case 'exporter': return 'エクスポートした人'
    case 'unnamed-participant': return '名前不明の参加者'
    default: return '不明'
  }
}

export async function loadImportedSenders(workspaceId: string, messageIds: string[]): Promise<Map<string, ImportedSender>> {
  const result = new Map<string, ImportedSender>()
  if (messageIds.length === 0) return result
  const { db, importedMessages, importIdentities, workspaceMembers, profiles } = await import('@cairn/db')
  const { and, eq, inArray } = await import('drizzle-orm')
  const rows = await db
    .select({
      messageId: importedMessages.messageId,
      source: importedMessages.source,
      originalSentAt: importedMessages.originalSentAt,
      isAnonymous: importIdentities.isAnonymous,
      kind: importIdentities.kind,
      displayName: importIdentities.displayName,
      linkedUserId: importIdentities.linkedUserId,
      // 紐づけた人の表示は、履歴上の行為者として非活性でも本人名義で出す（workspace_members を直接引く）
      linkedMemberName: workspaceMembers.displayName,
      linkedProfileName: profiles.displayName,
      linkedAvatarUrl: workspaceMembers.avatarUrl,
    })
    .from(importedMessages)
    .innerJoin(importIdentities, eq(importIdentities.id, importedMessages.identityId))
    .leftJoin(profiles, eq(profiles.id, importIdentities.linkedUserId))
    .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, importIdentities.linkedUserId), eq(workspaceMembers.workspaceId, workspaceId)))
    .where(and(eq(importedMessages.workspaceId, workspaceId), inArray(importedMessages.messageId, messageIds)))
  for (const row of rows) {
    const kind = row.kind as ImportedIdentityKind
    const linkedName = row.linkedUserId ? (row.linkedMemberName || row.linkedProfileName) : null
    result.set(row.messageId, {
      name: linkedName || row.displayName || fallbackImportedName(kind),
      avatarUrl: row.linkedUserId ? row.linkedAvatarUrl ?? null : null,
      info: {
        source: row.source,
        originalSentAt: row.originalSentAt.toISOString(),
        anonymous: row.isAnonymous,
        identityKind: kind,
        originalName: row.displayName,
        linkedUserId: row.linkedUserId,
      },
    })
  }
  return result
}

export interface ImportedReactionRow {
  messageId: string
  emoji: string
  userName: string
  linkedUserId: string | null
}

export async function loadImportedReactions(workspaceId: string, messageIds: string[]): Promise<ImportedReactionRow[]> {
  if (messageIds.length === 0) return []
  const { db, importedMessageReactions, importIdentities, workspaceMembers, profiles } = await import('@cairn/db')
  const { and, asc, eq, inArray } = await import('drizzle-orm')
  const rows = await db
    .select({
      messageId: importedMessageReactions.messageId,
      emoji: importedMessageReactions.emoji,
      kind: importIdentities.kind,
      displayName: importIdentities.displayName,
      linkedUserId: importIdentities.linkedUserId,
      linkedMemberName: workspaceMembers.displayName,
      linkedProfileName: profiles.displayName,
    })
    .from(importedMessageReactions)
    .innerJoin(importIdentities, and(eq(importIdentities.id, importedMessageReactions.identityId), eq(importIdentities.workspaceId, workspaceId)))
    .leftJoin(profiles, eq(profiles.id, importIdentities.linkedUserId))
    .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, importIdentities.linkedUserId), eq(workspaceMembers.workspaceId, workspaceId)))
    .where(inArray(importedMessageReactions.messageId, messageIds))
    .orderBy(asc(importedMessageReactions.reactedAt))
  return rows.map(row => ({
    messageId: row.messageId,
    emoji: row.emoji,
    userName: (row.linkedUserId ? row.linkedMemberName || row.linkedProfileName : null) || row.displayName || fallbackImportedName(row.kind as ImportedIdentityKind),
    linkedUserId: row.linkedUserId,
  }))
}
