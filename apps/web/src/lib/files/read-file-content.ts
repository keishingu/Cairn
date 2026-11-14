// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { AuthContext } from '@/lib/get-auth-context'
import { isIndexable } from '@/lib/ai/extract-text'
import { canAccessFile } from '@/lib/permissions'

export interface FileContentResult {
  file: {
    id: string
    projectId: string | null
    fileName: string
    mimeType: string | null
    fileType: string
    externalUrl: string | null
  }
  chunks: Array<{ chunkIndex: number; content: string }>
  nextStartChunk: number | null
}

export type ReadFileContentOutcome =
  | { ok: true; value: FileContentResult }
  | { ok: false; status: 403 | 404 | 409 | 422; error: string }

// `canAccessFile` 適用後の抽出済み本文（document_chunks）を返す。
// `/api/files/[id]/content`（MCP の read_file）と `/ai` の read_file tool で同じ境界を使う。
export async function readFileContent(
  ctx: AuthContext,
  input: { fileId: string; startChunk: number; limit: number },
): Promise<ReadFileContentOutcome> {
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
    .where(eq(files.id, input.fileId))
    .limit(1)

  if (!file) return { ok: false, status: 404, error: 'ファイルが見つかりません' }

  const canAccess = await canAccessFile(ctx.workspaceId, ctx.userId, file, ctx.role)
  if (!canAccess) {
    return { ok: false, status: 403, error: 'このファイルを閲覧する権限がありません' }
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
        eq(documentChunks.sourceId, input.fileId),
        gte(documentChunks.chunkIndex, input.startChunk),
      ),
    )
    .orderBy(asc(documentChunks.chunkIndex))
    .limit(input.limit + 1)

  const metadata = (file.metadata ?? {}) as Record<string, unknown>
  if (rows.length === 0 && input.startChunk === 0) {
    const indexingStatus = metadata['indexingStatus']
    const supportsText = file.fileType === 'link' || isIndexable(file.mimeType ?? '')

    if (!supportsText) {
      return { ok: false, status: 422, error: 'このファイル形式はテキスト抽出に対応していません' }
    }

    return {
      ok: false,
      status: 409,
      error:
        indexingStatus === 'failed'
          ? 'ファイル本文のインデックス作成に失敗しています'
          : 'ファイル本文はまだインデックスされていません',
    }
  }

  const hasMore = rows.length > input.limit
  const chunks = hasMore ? rows.slice(0, input.limit) : rows
  const lastChunk = chunks.at(-1)
  const externalUrl = metadata['externalUrl']

  return {
    ok: true,
    value: {
      file: {
        id: file.id,
        projectId: file.projectId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        fileType: file.fileType,
        externalUrl: file.fileType === 'link' && typeof externalUrl === 'string' ? externalUrl : null,
      },
      chunks,
      nextStartChunk: hasMore && lastChunk ? lastChunk.chunkIndex + 1 : null,
    },
  }
}
