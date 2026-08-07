// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'

export interface ChannelFileDto {
  id: string
  sourceMessageId: string | null
  fileName: string
  mimeType: string | null
  fileSize: number | null
  fileType: string
  uploaderName: string
  createdAt: string
  externalUrl?: string
  indexingStatus?: string
}

type RouteContext = { params: Promise<{ channelId: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const { channelId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId, ctx.role)
  if (forbidden) return forbidden

  try {
    const { db, files, profiles, messageAttachments, messages, galleryItems, documentChunks, workspaceMembers } = await import('@cairn/db')
    const { eq, and, isNull, desc, inArray, exists, or, sql } = await import('drizzle-orm')
    const { isIndexable } = await import('@/lib/ai/extract-text')

    // メッセージ添付ファイルに加え、チャットに貼った Google Docs リンク
    // （metadata.channelIds に紐付く。旧形式 metadata.channelId の単一文字列も後方互換で見る）も対象にする。
    // ソフトデリート済みメッセージの添付は除外する
    const attachedToChannelSq = db
      .select({ one: sql<number>`1` })
      .from(messageAttachments)
      .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
      .where(and(
        eq(messageAttachments.fileId, files.id),
        eq(messages.channelId, channelId),
        isNull(messages.deletedAt),
      ))

    const rows = await db
      .select({
        id: files.id,
        fileName: files.fileName,
        mimeType: files.mimeType,
        fileSize: files.fileSize,
        fileType: files.fileType,
        uploaderName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
        createdAt: files.createdAt,
        metadata: files.metadata,
      })
      .from(files)
      .innerJoin(profiles, eq(files.uploadedBy, profiles.id))
      .leftJoin(
        workspaceMembers,
        and(eq(workspaceMembers.userId, files.uploadedBy), eq(workspaceMembers.workspaceId, ctx.workspaceId)),
      )
      .leftJoin(galleryItems, eq(galleryItems.fileId, files.id))
      .where(and(
        eq(files.workspaceId, ctx.workspaceId),
        or(
          exists(attachedToChannelSq),
          sql`${files.metadata}->>'channelId' = ${channelId}`,
          sql`${files.metadata}->'channelIds' @> jsonb_build_array(${channelId}::text)`,
        ),
        isNull(galleryItems.id),
      ))
      .orderBy(desc(files.createdAt))

    const fileIds = rows.map(r => r.id)
    const chunkedIdSet = new Set<string>()
    const sourceMessageIdByFileId = new Map<string, string>()
    if (fileIds.length > 0) {
      const [chunked, attachmentSources] = await Promise.all([
        db
          .selectDistinct({ sourceId: documentChunks.sourceId })
          .from(documentChunks)
          .where(and(
            eq(documentChunks.sourceType, 'file'),
            inArray(documentChunks.sourceId, fileIds),
          )),
        db
          .select({ fileId: messageAttachments.fileId, messageId: messages.id })
          .from(messageAttachments)
          .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
          .where(and(
            inArray(messageAttachments.fileId, fileIds),
            eq(messages.channelId, channelId),
            isNull(messages.deletedAt),
          ))
          .orderBy(desc(messages.createdAt)),
      ])
      chunked.forEach(c => chunkedIdSet.add(c.sourceId))
      for (const source of attachmentSources) {
        if (!sourceMessageIdByFileId.has(source.fileId)) {
          sourceMessageIdByFileId.set(source.fileId, source.messageId)
        }
      }
    }

    // 外部リンクは message_attachments を持たないため、同じチャンネル内で
    // URL を含む最新のメッセージをジャンプ先として解決する。
    const externalLinks = rows.flatMap(r => {
      if (r.fileType !== 'link') return []
      const externalUrl = ((r.metadata ?? {}) as Record<string, unknown>)['externalUrl']
      return typeof externalUrl === 'string' ? [{ fileId: r.id, externalUrl }] : []
    })
    if (externalLinks.length > 0) {
      const linkMessages = await db
        .select({ id: messages.id, content: messages.content })
        .from(messages)
        .where(and(
          eq(messages.channelId, channelId),
          isNull(messages.deletedAt),
          or(...externalLinks.map(link => sql`position(${link.externalUrl} in ${messages.content}) > 0`)),
        ))
        .orderBy(desc(messages.createdAt))

      for (const message of linkMessages) {
        for (const link of externalLinks) {
          if (!sourceMessageIdByFileId.has(link.fileId) && message.content.includes(link.externalUrl)) {
            sourceMessageIdByFileId.set(link.fileId, message.id)
          }
        }
      }
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
          sourceMessageId: sourceMessageIdByFileId.get(r.id) ?? null,
          fileName: r.fileName,
          mimeType: r.mimeType,
          fileSize: r.fileSize,
          fileType: r.fileType,
          uploaderName: r.uploaderName,
          createdAt: r.createdAt.toISOString(),
          ...(typeof externalUrl === 'string' ? { externalUrl } : {}),
          ...(indexingStatus !== undefined ? { indexingStatus } : {}),
        }
      }) satisfies ChannelFileDto[],
    )
  } catch (err) {
    console.error('[/api/channels/[channelId]/files GET] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
