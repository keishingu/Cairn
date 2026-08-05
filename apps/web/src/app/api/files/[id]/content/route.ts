// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { isIndexable } from '@/lib/ai/extract-text'
import { canAccessFile } from '@/lib/permissions'

const querySchema = z.object({
  startChunk: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(10).default(5),
})

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: RouteContext) {
  const { ctx, error } = await getAuthContext({
    allowApiToken: true,
    requiredApiTokenScope: 'read',
  })
  if (error) return error

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: 'startChunk または limit が不正です' }, { status: 422 })
  }

  const { id: fileId } = await params
  const { startChunk, limit } = parsed.data

  try {
    const { db, documentChunks, files } = await import('@cairn/db')
    const { and, asc, eq, gte } = await import('drizzle-orm')

    const [file] = await db
      .select({
        id: files.id,
        workspaceId: files.workspaceId,
        projectId: files.projectId,
        uploadedBy: files.uploadedBy,
        fileName: files.fileName,
        mimeType: files.mimeType,
        fileType: files.fileType,
        metadata: files.metadata,
      })
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1)

    if (!file) return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 404 })

    const canAccess = await canAccessFile(ctx.workspaceId, ctx.userId, file, ctx.role)
    if (!canAccess) {
      return NextResponse.json({ error: 'このファイルを閲覧する権限がありません' }, { status: 403 })
    }

    const rows = await db
      .select({
        chunkIndex: documentChunks.chunkIndex,
        content: documentChunks.content,
      })
      .from(documentChunks)
      .where(
        and(
          eq(documentChunks.sourceType, 'file'),
          eq(documentChunks.sourceId, fileId),
          gte(documentChunks.chunkIndex, startChunk),
        ),
      )
      .orderBy(asc(documentChunks.chunkIndex))
      .limit(limit + 1)

    if (rows.length === 0 && startChunk === 0) {
      const metadata = (file.metadata ?? {}) as Record<string, unknown>
      const indexingStatus = metadata['indexingStatus']
      const supportsText = file.fileType === 'link' || isIndexable(file.mimeType ?? '')

      if (!supportsText) {
        return NextResponse.json(
          { error: 'このファイル形式はテキスト抽出に対応していません' },
          { status: 422 },
        )
      }

      return NextResponse.json(
        {
          error:
            indexingStatus === 'failed'
              ? 'ファイル本文のインデックス作成に失敗しています'
              : 'ファイル本文はまだインデックスされていません',
        },
        { status: 409 },
      )
    }

    const hasMore = rows.length > limit
    const chunks = hasMore ? rows.slice(0, limit) : rows
    const lastChunk = chunks.at(-1)

    return NextResponse.json({
      file: {
        id: file.id,
        fileName: file.fileName,
        mimeType: file.mimeType,
        fileType: file.fileType,
      },
      chunks,
      nextStartChunk: hasMore && lastChunk ? lastChunk.chunkIndex + 1 : null,
    })
  } catch (err) {
    console.error('[GET /api/files/[id]/content]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
