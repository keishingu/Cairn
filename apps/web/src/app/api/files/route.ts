// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

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

const MOCK_FILES: FileDto[] = [
  { id: 'mock-f1', projectId: 'p1', projectTitle: '北アルプス縦走計画', channelName: null, fileName: '縦走計画書v3.pdf',                      mimeType: 'application/pdf',                                                                 fileSize: 887 * 1024, fileType: 'document', uploaderName: '山田 太郎', uploaderAvatarUrl: null, createdAt: '2026-05-23T10:17:00Z' },
  { id: 'mock-f5', projectId: 'p3', projectTitle: 'クライミング講習会', channelName: null, fileName: '周辺環境ピックアップツール 補足資料.pdf', mimeType: 'application/pdf',                                                                 fileSize: 887 * 1024, fileType: 'document', uploaderName: '新宮 圭',  uploaderAvatarUrl: null, createdAt: '2026-05-23T10:17:00Z' },
  { id: 'mock-f4', projectId: 'p3', projectTitle: 'クライミング講習会', channelName: null, fileName: '会社印での本人確認申請書.pdf',             mimeType: 'application/pdf',                                                                 fileSize:  58 * 1024, fileType: 'document', uploaderName: '新宮 圭',  uploaderAvatarUrl: null, createdAt: '2026-05-22T23:58:00Z' },
  { id: 'mock-f3', projectId: 'p1', projectTitle: '北アルプス縦走計画', channelName: null, fileName: '19978980.webp',                           mimeType: 'image/webp',                                                                      fileSize:  31 * 1024, fileType: 'image',    uploaderName: '山田 太郎', uploaderAvatarUrl: null, createdAt: '2026-05-22T23:47:00Z' },
  { id: 'mock-f2', projectId: 'p1', projectTitle: '北アルプス縦走計画', channelName: null, fileName: '装備リスト.xlsx',                          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',               fileSize:  42 * 1024, fileType: 'document', uploaderName: '佐藤 花子', uploaderAvatarUrl: null, createdAt: '2026-05-22T14:30:00Z' },
  { id: 'mock-f6', projectId: 'p2', projectTitle: '夏山合宿計画',       channelName: null, fileName: '夏山行程表.docx',                          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',         fileSize: 102 * 1024, fileType: 'document', uploaderName: '田中 陽子', uploaderAvatarUrl: null, createdAt: '2026-05-20T09:00:00Z' },
  { id: 'mock-f7', projectId: null, projectTitle: null,                  channelName: '雑談',  fileName: '職務経歴書_20230122.pdf',              mimeType: 'application/pdf',                                                                 fileSize:  74 * 1024, fileType: 'document', uploaderName: '新宮 圭',  uploaderAvatarUrl: null, createdAt: '2026-05-19T16:45:00Z' },
]

export async function GET() {
  if (!process.env['DATABASE_URL']) {
    return NextResponse.json(MOCK_FILES satisfies FileDto[])
  }

  try {
    const { ctx, error } = await getAuthContext()
    if (error) return error

    const { db, files, profiles, projects, messageAttachments, messages, channels, galleryItems, documentChunks, workspaceMembers } = await import('@cairn/db')
    const { eq, and, desc, isNull, inArray, sql } = await import('drizzle-orm')

    const INDEXABLE_MIMES = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ])

    const rows = await db
      .select({
        id: files.id,
        projectId: files.projectId,
        projectTitle: projects.title,
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
        uploaderName: profiles.displayName,
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
      ))
      .orderBy(desc(files.createdAt))

    // suppress unused import warnings — tables are referenced in the sql subquery
    void messageAttachments; void messages; void channels

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
        } else if (INDEXABLE_MIMES.has(r.mimeType ?? '')) {
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
    return NextResponse.json(MOCK_FILES satisfies FileDto[])
  }
}
