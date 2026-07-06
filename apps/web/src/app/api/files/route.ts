// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { getWorkspaceMemberRole } from '@/lib/permissions'
import { hasWorkspaceMemberDisplayNameColumn, workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'

export interface FileDto {
  id: string
  projectId: string | null
  projectTitle: string | null
  channelName: string | null
  fileName: string
  mimeType: string | null
  fileSize: number | null
  fileType: string
  uploaderName: string
  uploaderAvatarUrl: string | null
  createdAt: string
  externalUrl?: string
  indexingStatus?: string
}

export async function GET() {
  try {
    const { ctx, error } = await getAuthContext()
    if (error) return error

    const { db, files, profiles, projects, projectMembers, messageAttachments, messages, channels, channelMembers, galleryItems, documentChunks, workspaceMembers } = await import('@cairn/db')
    const { eq, and, desc, isNull, isNotNull, inArray, sql, exists, or, ne } = await import('drizzle-orm')
    const { isIndexable } = await import('@/lib/ai/extract-text')
    const displayNameExpr = (await hasWorkspaceMemberDisplayNameColumn(db))
      ? workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName)
      : profiles.displayName

    const role = await getWorkspaceMemberRole(ctx.workspaceId, ctx.userId)
    if (!role) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 })
    }

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

    const channelAccessCondition = role === 'guest'
      ? or(
          exists(channelMemberSq),
          exists(guestProjectChannelAccessSq),
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

    const attachedChannelAccessSq = db
      .select({ one: sql<number>`1` })
      .from(messageAttachments)
      .innerJoin(messages, eq(messageAttachments.messageId, messages.id))
      .innerJoin(channels, eq(messages.channelId, channels.id))
      .where(and(
        eq(messageAttachments.fileId, files.id),
        channelAccessCondition,
      ))

    // metadata.channelIds（新形式の配列）と旧形式の単一 metadata.channelId の両方を対象にする
    const metadataChannelAccessSq = db
      .select({ one: sql<number>`1` })
      .from(channels)
      .where(and(
        sql`(
          ${channels.id}::text = ${files.metadata}->>'channelId'
          or ${files.metadata}->'channelIds' @> jsonb_build_array(${channels.id}::text)
        )`,
        channelAccessCondition,
      ))

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

    const rows = await db
      .select({
        id: files.id,
        projectId: files.projectId,
        projectTitle: projects.title,
        workspaceId: files.workspaceId,
        channelName: sql<string | null>`(
          SELECT ch.name
          FROM message_attachments ma
          INNER JOIN messages msg ON msg.id = ma.message_id
          INNER JOIN channels ch ON ch.id = msg.channel_id
          WHERE ma.file_id = ${files.id}
          LIMIT 1
        )`,
        fileName: files.fileName,
        mimeType: files.mimeType,
        fileSize: files.fileSize,
        fileType: files.fileType,
        metadata: files.metadata,
        uploaderName: displayNameExpr,
        uploaderAvatarUrl: workspaceMembers.avatarUrl,
        createdAt: files.createdAt,
      })
      .from(files)
      .leftJoin(projects, eq(files.projectId, projects.id))
      .innerJoin(profiles, eq(files.uploadedBy, profiles.id))
      .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, files.uploadedBy), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
      .leftJoin(galleryItems, eq(galleryItems.fileId, files.id))
      .where(and(
        eq(files.workspaceId, ctx.workspaceId),
        isNull(galleryItems.id),
        visibleFileCondition,
      ))
      .orderBy(desc(files.createdAt))

    const fileIds = rows.map(r => r.id)
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

    return NextResponse.json(
      rows.map(r => {
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
          projectId: r.projectId ?? null,
          projectTitle: r.projectTitle ?? null,
          channelName: r.channelName ?? null,
          fileName: r.fileName,
          mimeType: r.mimeType,
          fileSize: r.fileSize,
          fileType: r.fileType,
          uploaderName: r.uploaderName,
          uploaderAvatarUrl: r.uploaderAvatarUrl ?? null,
          createdAt: r.createdAt.toISOString(),
          ...(typeof externalUrl === 'string' ? { externalUrl } : {}),
          ...(indexingStatus !== undefined ? { indexingStatus } : {}),
        }
      }) satisfies FileDto[],
    )
  } catch (err) {
    console.error('[GET /api/files] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
