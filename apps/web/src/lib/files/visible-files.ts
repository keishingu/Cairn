// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// ファイル一覧（GET /api/files）と件数集計（GET /api/files/facets）が共有する SQL 条件。
// 可視範囲の判定を1か所に置き、一覧と件数で見えるファイルがずれないようにする。

import { FEATURE_FLAGS } from '@cairn/shared'
import type { SQL } from 'drizzle-orm'
import { DOC_MIME_TYPES, escapeLikePattern, type FileListFilters } from './file-list-query'

export interface VisibleFilesContext {
  userId: string
  workspaceId: string
  role: 'owner' | 'admin' | 'member' | 'guest'
}

export async function buildVisibleFilesConditions(ctx: VisibleFilesContext) {
  const { db, files, projectMembers, messageAttachments, messages, channels, channelMembers, galleryItems } = await import('@cairn/db')
  const { eq, and, isNull, isNotNull, sql, exists, not, or, ne } = await import('drizzle-orm')

  const role = ctx.role

  const fileProjectMemberSq = db
    .select({ one: sql<number>`1` })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, files.projectId), eq(projectMembers.userId, ctx.userId)))

  const channelMemberSq = db
    .select({ one: sql<number>`1` })
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channels.id), eq(channelMembers.userId, ctx.userId)))

  const guestProjectChannelAccessSq = db
    .select({ one: sql<number>`1` })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, channels.projectId), eq(projectMembers.userId, ctx.userId)))

  const guestPublicWorkspaceChannelCondition = and(
    eq(channels.type, 'workspace'),
    eq(channels.isPrivate, false),
    eq(channels.workspaceId, ctx.workspaceId),
  )

  const channelAccessCondition = role === 'guest'
    ? or(
        guestPublicWorkspaceChannelCondition,
        and(
          exists(channelMemberSq),
          or(ne(channels.type, 'project'), exists(guestProjectChannelAccessSq)),
        ),
        and(
          eq(channels.type, 'project'),
          eq(channels.isPrivate, false),
          exists(guestProjectChannelAccessSq),
        ),
      )
    : or(
        and(
          eq(channels.isPrivate, false),
          ne(channels.type, 'dm'),
          // 旧データの project channel は workspace_id が null のことがあるため許容する。
          // files.workspace_id 側で現在ワークスペースには絞れている。
          or(eq(channels.workspaceId, ctx.workspaceId), isNull(channels.workspaceId)),
        ),
        exists(channelMemberSq),
      )

  const navigableChannelCondition = FEATURE_FLAGS.dm
    ? channelAccessCondition
    : and(ne(channels.type, 'dm'), channelAccessCondition)

  // metadata.channelIds（新形式の配列）と旧形式の単一 metadata.channelId の両方を対象にする
  const metadataChannelMatch = sql`(
    ${channels.id}::text = ${files.metadata}->>'channelId'
    or ${files.metadata}->'channelIds' @> jsonb_build_array(${channels.id}::text)
  )`

  const attachedChannelAccessSq = db
    .select({ one: sql<number>`1` })
    .from(messageAttachments)
    .innerJoin(messages, eq(messageAttachments.messageId, messages.id))
    .innerJoin(channels, eq(messages.channelId, channels.id))
    .where(and(
      eq(messageAttachments.fileId, files.id),
      channelAccessCondition,
    ))

  const metadataChannelAccessSq = db
    .select({ one: sql<number>`1` })
    .from(channels)
    .where(and(metadataChannelMatch, channelAccessCondition))

  // DM 停止中は、参加者本人やアップロード者本人であっても DM 由来のファイルを
  // グローバルファイル一覧へ露出させない。添付と metadata の両経路を対象にする。
  const dmAttachedFileSq = db
    .select({ one: sql<number>`1` })
    .from(messageAttachments)
    .innerJoin(messages, eq(messageAttachments.messageId, messages.id))
    .innerJoin(channels, eq(messages.channelId, channels.id))
    .where(and(
      eq(messageAttachments.fileId, files.id),
      eq(channels.type, 'dm'),
    ))

  const dmMetadataFileSq = db
    .select({ one: sql<number>`1` })
    .from(channels)
    .where(and(eq(channels.type, 'dm'), metadataChannelMatch))

  const visibleNonDmAttachedFileSq = db
    .select({ one: sql<number>`1` })
    .from(messageAttachments)
    .innerJoin(messages, eq(messageAttachments.messageId, messages.id))
    .innerJoin(channels, eq(messages.channelId, channels.id))
    .where(and(
      eq(messageAttachments.fileId, files.id),
      ne(channels.type, 'dm'),
      channelAccessCondition,
    ))

  const visibleNonDmMetadataFileSq = db
    .select({ one: sql<number>`1` })
    .from(channels)
    .where(and(ne(channels.type, 'dm'), metadataChannelMatch, channelAccessCondition))

  const visibleNonDmFileCondition = role === 'guest'
    ? or(
        exists(fileProjectMemberSq),
        exists(visibleNonDmAttachedFileSq),
        exists(visibleNonDmMetadataFileSq),
      )
    : or(
        isNotNull(files.projectId),
        exists(visibleNonDmAttachedFileSq),
        exists(visibleNonDmMetadataFileSq),
      )

  const visibleFileCondition = role === 'guest'
    ? or(
        eq(files.uploadedBy, ctx.userId),
        exists(fileProjectMemberSq),
        exists(attachedChannelAccessSq),
        exists(metadataChannelAccessSq),
      )
    : or(
        eq(files.uploadedBy, ctx.userId),
        isNotNull(files.projectId),
        exists(attachedChannelAccessSq),
        exists(metadataChannelAccessSq),
      )

  // ギャラリーの画像はファイル一覧に出さない
  const galleryItemSq = db
    .select({ one: sql<number>`1` })
    .from(galleryItems)
    .where(eq(galleryItems.fileId, files.id))

  const visibleWhere = and(
    eq(files.workspaceId, ctx.workspaceId),
    not(exists(galleryItemSq)),
    FEATURE_FLAGS.dm
      ? undefined
      : or(
          and(not(exists(dmAttachedFileSq)), not(exists(dmMetadataFileSq))),
          visibleNonDmFileCondition,
        ),
    visibleFileCondition,
  ) as SQL

  return { visibleWhere, navigableChannelCondition, metadataChannelMatch }
}

/** 画面の絞り込み条件（種類・プロジェクト・アップロード者・期間・検索語）を SQL 条件にする */
export async function buildFileFilterConditions(
  filters: FileListFilters,
  navigableChannelCondition: SQL | undefined,
): Promise<SQL[]> {
  const { db, files, projects, messageAttachments, messages, channels } = await import('@cairn/db')
  const { eq, and, isNull, sql, exists, or, gte, lt, like, ilike, inArray } = await import('drizzle-orm')

  const conditions: SQL[] = []

  if (filters.type === 'pdf') conditions.push(eq(files.mimeType, 'application/pdf'))
  else if (filters.type === 'img') conditions.push(like(files.mimeType, 'image/%'))
  else if (filters.type === 'doc') conditions.push(inArray(files.mimeType, DOC_MIME_TYPES))

  if (filters.projectId === 'none') conditions.push(isNull(files.projectId))
  else if (filters.projectId !== 'all') conditions.push(eq(files.projectId, filters.projectId))

  if (filters.uploaderId !== 'all') conditions.push(eq(files.uploadedBy, filters.uploaderId))

  if (filters.createdFrom) conditions.push(gte(files.createdAt, new Date(filters.createdFrom)))
  if (filters.createdBefore) conditions.push(lt(files.createdAt, new Date(filters.createdBefore)))

  for (const term of filters.search) {
    const pattern = `%${escapeLikePattern(term)}%`
    const projectTitleSq = db
      .select({ one: sql<number>`1` })
      .from(projects)
      .where(and(eq(projects.id, files.projectId), ilike(projects.title, pattern)))
    const channelNameSq = db
      .select({ one: sql<number>`1` })
      .from(messageAttachments)
      .innerJoin(messages, eq(messageAttachments.messageId, messages.id))
      .innerJoin(channels, eq(messages.channelId, channels.id))
      .where(and(
        eq(messageAttachments.fileId, files.id),
        isNull(messages.deletedAt),
        navigableChannelCondition,
        ilike(channels.name, pattern),
      ))
    conditions.push(or(
      ilike(files.fileName, pattern),
      exists(projectTitleSq),
      exists(channelNameSq),
    ) as SQL)
  }

  return conditions
}
