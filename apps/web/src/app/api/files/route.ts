// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'
import { encodeFileListCursor, parseFileListParams } from '@/lib/files/file-list-query'
import { buildFileFilterConditions, buildVisibleFilesConditions } from '@/lib/files/visible-files'

export interface FileDto {
  id: string
  sourceChannelId: string | null
  sourceMessageId: string | null
  projectId: string | null
  projectTitle: string | null
  channelName: string | null
  fileName: string
  mimeType: string | null
  fileSize: number | null
  fileType: string
  uploaderId: string
  uploaderName: string
  uploaderAvatarUrl: string | null
  createdAt: string
  externalUrl?: string
  indexingStatus?: string
}

export interface FileListResponse {
  items: FileDto[]
  /** 次のページを取るときに `cursor` へ渡す値。最後のページなら null */
  nextCursor: string | null
}

/**
 * ワークスペース内で見えるファイルを新しい順に返す。件数が多くても1回の応答が重くならないよう、
 * `limit` 件ずつ `(created_at, id)` のカーソルでページ分割し、絞り込みも SQL で行う。
 */
export async function GET(request: Request) {
  try {
    const { ctx, error } = await getAuthContext({
      allowApiToken: true,
      requiredApiTokenScope: 'read',
    })
    if (error) return error

    const role = ctx.role
    if (!role) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 })
    }

    const parsed = parseFileListParams(new URL(request.url).searchParams)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const { db, files, profiles, projects, documentChunks, workspaceMembers } = await import('@cairn/db')
    const { eq, and, desc, inArray, sql } = await import('drizzle-orm')
    const { isIndexable } = await import('@/lib/ai/extract-text')

    const { visibleWhere, navigableChannelCondition, metadataChannelMatch } =
      await buildVisibleFilesConditions({ userId: ctx.userId, workspaceId: ctx.workspaceId, role })
    const filterConditions = await buildFileFilterConditions(parsed.filters, navigableChannelCondition)
    const cursorCondition = parsed.cursor
      ? sql`(${files.createdAt}, ${files.id}) < (${parsed.cursor.createdAt}::timestamptz, ${parsed.cursor.id}::uuid)`
      : undefined

    const rows = await db
      .select({
        id: files.id,
        projectId: files.projectId,
        projectTitle: projects.title,
        chatSource: sql<{ channelId: string; messageId: string; channelName: string } | null>`(
          SELECT jsonb_build_object(
            'channelId', msg.channel_id,
            'messageId', msg.id,
            'channelName', channels.name
          )
          FROM message_attachments ma
          INNER JOIN messages msg ON msg.id = ma.message_id
          INNER JOIN channels ON channels.id = msg.channel_id
          WHERE ma.file_id = ${files.id}
            AND msg.deleted_at IS NULL
            AND ${navigableChannelCondition}
          ORDER BY msg.created_at DESC
          LIMIT 1
        )`,
        metadataChannelId: sql<string | null>`(
          SELECT channels.id::text
          FROM channels
          WHERE ${metadataChannelMatch}
            AND ${navigableChannelCondition}
          LIMIT 1
        )`,
        fileName: files.fileName,
        mimeType: files.mimeType,
        fileSize: files.fileSize,
        fileType: files.fileType,
        uploaderId: files.uploadedBy,
        metadata: files.metadata,
        uploaderName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
        uploaderAvatarUrl: workspaceMembers.avatarUrl,
        createdAt: files.createdAt,
        // JS の Date はミリ秒までなので、カーソルにはマイクロ秒まで残した文字列を使う
        cursorCreatedAt: sql<string>`to_char(${files.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(files)
      .leftJoin(projects, eq(files.projectId, projects.id))
      .innerJoin(profiles, eq(files.uploadedBy, profiles.id))
      .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, files.uploadedBy), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
      .where(and(visibleWhere, ...filterConditions, cursorCondition))
      .orderBy(desc(files.createdAt), desc(files.id))
      .limit(parsed.limit + 1)

    const hasMore = rows.length > parsed.limit
    const pageRows = hasMore ? rows.slice(0, parsed.limit) : rows
    const last = pageRows.at(-1)
    const nextCursor = hasMore && last
      ? encodeFileListCursor({ createdAt: last.cursorCreatedAt, id: last.id })
      : null

    const fileIds = pageRows.map(r => r.id)
    const chunkedIdSet = new Set<string>()
    if (fileIds.length > 0) {
      const chunked = await db
        .selectDistinct({ sourceId: documentChunks.sourceId })
        .from(documentChunks)
        .where(and(
          eq(documentChunks.sourceType, 'file'),
          inArray(documentChunks.sourceId, fileIds),
        ))
      chunked.forEach(c => chunkedIdSet.add(c.sourceId))
    }

    const items = pageRows.map(r => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>
      const externalUrl = meta['externalUrl']

      let indexingStatus: string | undefined
      if (r.fileType === 'link') {
        const s = meta['indexingStatus']
        indexingStatus = typeof s === 'string' ? s : undefined
      } else if (isIndexable(r.mimeType ?? '')) {
        indexingStatus = chunkedIdSet.has(r.id) ? 'indexed' : 'pending'
      }

      return {
        id: r.id,
        sourceChannelId: r.chatSource?.channelId ?? r.metadataChannelId ?? null,
        sourceMessageId: r.chatSource?.messageId ?? null,
        projectId: r.projectId ?? null,
        projectTitle: r.projectTitle ?? null,
        channelName: r.chatSource?.channelName ?? null,
        fileName: r.fileName,
        mimeType: r.mimeType,
        fileSize: r.fileSize,
        fileType: r.fileType,
        uploaderId: r.uploaderId,
        uploaderName: r.uploaderName,
        uploaderAvatarUrl: r.uploaderAvatarUrl ?? null,
        createdAt: r.createdAt.toISOString(),
        ...(typeof externalUrl === 'string' ? { externalUrl } : {}),
        ...(indexingStatus !== undefined ? { indexingStatus } : {}),
      }
    }) satisfies FileDto[]

    return NextResponse.json({ items, nextCursor } satisfies FileListResponse)
  } catch (err) {
    console.error('[GET /api/files] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
