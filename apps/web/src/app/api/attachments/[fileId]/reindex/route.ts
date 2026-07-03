// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

type RouteContext = { params: Promise<{ fileId: string }> }

function isPendingUpload(metadata: unknown) {
  return (
    metadata &&
    typeof metadata === 'object' &&
    typeof (metadata as Record<string, unknown>)['pendingChannelId'] === 'string'
  )
}

export async function POST(_req: Request, { params }: RouteContext) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const { fileId } = await params

  try {
    const { db, files, documentChunks } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    const [file] = await db
      .select({ id: files.id, workspaceId: files.workspaceId, storagePath: files.storagePath, mimeType: files.mimeType, metadata: files.metadata })
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1)

    if (!file) return new NextResponse(null, { status: 404 })
    if (file.workspaceId !== ctx.workspaceId) return new NextResponse(null, { status: 403 })
    if (!file.storagePath || !file.mimeType) return NextResponse.json({ error: 'このファイルは再インデックスできません' }, { status: 422 })
    if (isPendingUpload(file.metadata)) {
      return NextResponse.json({ error: '未送信の添付は再インデックスできません' }, { status: 422 })
    }

    const { isIndexable } = await import('@/lib/ai/extract-text')
    if (!isIndexable(file.mimeType)) {
      return NextResponse.json({ error: 'このファイルはインデックス対象外です' }, { status: 422 })
    }

    // 既存のベクトルデータを削除してステータスをリセット
    await db.delete(documentChunks).where(and(eq(documentChunks.sourceType, 'file'), eq(documentChunks.sourceId, fileId)))

    const meta = Object.assign({}, file.metadata as Record<string, unknown>)
    await db.update(files).set({ metadata: { ...meta, indexingStatus: 'pending' } }).where(eq(files.id, fileId))

    const { inngest } = await import('@/lib/inngest/client')
    await inngest.send({
      name: 'file/uploaded',
      data: { fileId: file.id, workspaceId: ctx.workspaceId, mimeType: file.mimeType, storagePath: file.storagePath },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[POST /api/attachments/[fileId]/reindex]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
