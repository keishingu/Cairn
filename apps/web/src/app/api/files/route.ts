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
  uploaderName: string
  createdAt: string
}

const MOCK_FILES: FileDto[] = [
  { id: 'mock-f1', projectId: 'p1', projectTitle: '北アルプス縦走計画', channelName: null, fileName: '縦走計画書v3.pdf',                      mimeType: 'application/pdf',                                                                 fileSize: 887 * 1024, uploaderName: '山田 太郎', createdAt: '2026-05-23T10:17:00Z' },
  { id: 'mock-f5', projectId: 'p3', projectTitle: 'クライミング講習会', channelName: null, fileName: '周辺環境ピックアップツール 補足資料.pdf', mimeType: 'application/pdf',                                                                 fileSize: 887 * 1024, uploaderName: '新宮 圭',  createdAt: '2026-05-23T10:17:00Z' },
  { id: 'mock-f4', projectId: 'p3', projectTitle: 'クライミング講習会', channelName: null, fileName: '会社印での本人確認申請書.pdf',             mimeType: 'application/pdf',                                                                 fileSize:  58 * 1024, uploaderName: '新宮 圭',  createdAt: '2026-05-22T23:58:00Z' },
  { id: 'mock-f3', projectId: 'p1', projectTitle: '北アルプス縦走計画', channelName: null, fileName: '19978980.webp',                           mimeType: 'image/webp',                                                                      fileSize:  31 * 1024, uploaderName: '山田 太郎', createdAt: '2026-05-22T23:47:00Z' },
  { id: 'mock-f2', projectId: 'p1', projectTitle: '北アルプス縦走計画', channelName: null, fileName: '装備リスト.xlsx',                          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',               fileSize:  42 * 1024, uploaderName: '佐藤 花子', createdAt: '2026-05-22T14:30:00Z' },
  { id: 'mock-f6', projectId: 'p2', projectTitle: '夏山合宿計画',       channelName: null, fileName: '夏山行程表.docx',                          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',         fileSize: 102 * 1024, uploaderName: '田中 陽子', createdAt: '2026-05-20T09:00:00Z' },
  { id: 'mock-f7', projectId: null, projectTitle: null,                  channelName: '雑談',  fileName: '職務経歴書_20230122.pdf',              mimeType: 'application/pdf',                                                                 fileSize:  74 * 1024, uploaderName: '新宮 圭',  createdAt: '2026-05-19T16:45:00Z' },
]

export async function GET() {
  if (!process.env['DATABASE_URL']) {
    return NextResponse.json(MOCK_FILES satisfies FileDto[])
  }

  try {
    const { ctx, error } = await getAuthContext()
    if (error) return error

    const { db, files, profiles, projects, messageAttachments, messages, channels, galleryItems } = await import('@cairn/db')
    const { eq, and, desc, isNull, sql } = await import('drizzle-orm')

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
        uploaderName: profiles.displayName,
        createdAt: files.createdAt,
      })
      .from(files)
      .leftJoin(projects, eq(files.projectId, projects.id))
      .innerJoin(profiles, eq(files.uploadedBy, profiles.id))
      .leftJoin(galleryItems, eq(galleryItems.fileId, files.id))
      .where(and(
        eq(files.workspaceId, ctx.workspaceId),
        isNull(galleryItems.id),
      ))
      .orderBy(desc(files.createdAt))

    // suppress unused import warnings — tables are referenced in the sql subquery
    void messageAttachments; void messages; void channels

    return NextResponse.json(
      rows.map(r => ({
        id: r.id,
        projectId: r.projectId ?? null,
        projectTitle: r.projectTitle ?? null,
        channelName: r.channelName ?? null,
        fileName: r.fileName,
        mimeType: r.mimeType,
        fileSize: r.fileSize,
        uploaderName: r.uploaderName,
        createdAt: r.createdAt.toISOString(),
      })) satisfies FileDto[],
    )
  } catch (err) {
    console.error('[GET /api/files] DB query failed:', err)
    return NextResponse.json(MOCK_FILES satisfies FileDto[])
  }
}
