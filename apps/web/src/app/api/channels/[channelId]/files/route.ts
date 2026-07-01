// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'

export interface ChannelFileDto {
  id: string
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

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId)
  if (forbidden) return forbidden

  try {
    const { db, files, profiles, messageAttachments, messages, galleryItems, documentChunks } = await import('@cairn/db')
    const { eq, and, isNull, desc, inArray, exists, or, sql } = await import('drizzle-orm')
    const { isIndexable } = await import('@/lib/ai/extract-text')

    // メッセージ添付ファイルに加え、チャットに貼った Google Docs リンク（metadata.channelId に紐付く）も対象にする
    const attachedToChannelSq = db
      .select({ one: sql<number>`1` })
      .from(messageAttachments)
      .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
      .where(and(
        eq(messageAttachments.fileId, files.id),
        eq(messages.channelId, channelId),
      ))

    const rows = await db
      .select({
        id: files.id,
        fileName: files.fileName,
        mimeType: files.mimeType,
        fileSize: files.fileSize,
        fileType: files.fileType,
        uploaderName: profiles.displayName,
        createdAt: files.createdAt,
        metadata: files.metadata,
      })
      .from(files)
      .innerJoin(profiles, eq(files.uploadedBy, profiles.id))
      .leftJoin(galleryItems, eq(galleryItems.fileId, files.id))
      .where(and(
        or(
          exists(attachedToChannelSq),
          sql`${files.metadata}->>'channelId' = ${channelId}`,
        ),
        isNull(galleryItems.id),
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
    return NextResponse.json([] satisfies ChannelFileDto[])
  }
}
