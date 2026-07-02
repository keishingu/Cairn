// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { canAccessFile, requireProjectAccess } from '@/lib/permissions'

export interface ProjectFileDto {
  id: string
  fileName: string
  mimeType: string | null
  fileSize: number | null
  fileType: string
  uploaderName: string
  createdAt: string
  externalUrl?: string
  indexingStatus?: string
  isLatest: boolean
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const { id: projectId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, files, profiles, projects, galleryItems, documentChunks } = await import('@cairn/db')
    const { eq, and, isNull, desc, inArray } = await import('drizzle-orm')
    const { isIndexable } = await import('@/lib/ai/extract-text')
    const accessCheckBatchSize = 50

    // プロジェクトが同一ワークスペースに属することを確認
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!project) {
      return new NextResponse(null, { status: 404 })
    }

    // ゲストは参加プロジェクトのファイルのみ閲覧可
    const forbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, projectId)
    if (forbidden) return forbidden

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
        workspaceId: files.workspaceId,
        projectId: files.projectId,
        uploadedBy: files.uploadedBy,
      })
      .from(files)
      .innerJoin(profiles, eq(files.uploadedBy, profiles.id))
      .leftJoin(galleryItems, eq(galleryItems.fileId, files.id))
      .where(and(
        eq(files.projectId, projectId),
        isNull(galleryItems.id),
      ))
      .orderBy(desc(files.createdAt))

    const visibleRows = []
    for (let index = 0; index < rows.length; index += accessCheckBatchSize) {
      const batch = rows.slice(index, index + accessCheckBatchSize)
      const visibleBatch = (
        await Promise.all(
          batch.map(async (row) => {
            const visible = await canAccessFile(
              ctx.workspaceId,
              ctx.userId,
              {
                id: row.id,
                workspaceId: row.workspaceId,
                projectId: row.projectId,
                uploadedBy: row.uploadedBy,
                metadata: row.metadata,
              },
            )
            return visible ? row : null
          }),
        )
      ).filter((row): row is typeof rows[number] => row !== null)
      visibleRows.push(...visibleBatch)
    }

    // チャンク済みファイルの ID セットを取得
    const fileIds = visibleRows.map(r => r.id)
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
      visibleRows.map(r => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>
        const externalUrl = meta['externalUrl']

        // リンク: metadata の indexingStatus をそのまま使う
        // アップロードファイル: indexable なら chunk の有無でステータスを決定
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
          isLatest: meta['isLatest'] === true,
          ...(typeof externalUrl === 'string' ? { externalUrl } : {}),
          ...(indexingStatus !== undefined ? { indexingStatus } : {}),
        }
      }) satisfies ProjectFileDto[],
    )
  } catch (err) {
    console.error('[/api/projects/[id]/files GET] DB query failed:', err)
    return NextResponse.json([] satisfies ProjectFileDto[])
  }
}
