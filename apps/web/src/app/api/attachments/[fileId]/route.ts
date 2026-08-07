// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { canAccessFile } from '@/lib/permissions'
import { createServiceRoleClient } from '@/lib/supabase/service'

type RouteContext = { params: Promise<{ fileId: string }> }

function extensionOf(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex > 0 ? fileName.slice(dotIndex).toLowerCase() : ''
}

function resolveResponseContentType(fileName: string, mimeType: string | null) {
  const normalizedMimeType = mimeType?.toLowerCase() ?? ''
  const normalizedFileName = fileName.toLowerCase()

  if (normalizedFileName.endsWith('.md') || normalizedFileName.endsWith('.markdown')) {
    return 'text/markdown; charset=utf-8'
  }
  if (normalizedFileName.endsWith('.txt')) {
    return 'text/plain; charset=utf-8'
  }

  const responseMimeType = mimeType ?? 'application/octet-stream'
  const isText = normalizedMimeType.startsWith('text/') || normalizedMimeType === 'application/json'
  return isText ? `${responseMimeType}; charset=utf-8` : responseMimeType
}

export async function GET(req: Request, { params }: RouteContext) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const { fileId } = await params

  // 一覧アイコン・チャットのサムネは ?thumb=1 で縮小版を要求する
  const wantThumb = new URL(req.url).searchParams.get('thumb') === '1'

  try {
    const { db, files } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1)

    if (!file) {
      return new NextResponse(null, { status: 404 })
    }

    const canAccess = await canAccessFile(ctx.workspaceId, ctx.userId, file, ctx.role)
    if (!canAccess) {
      return new NextResponse(null, { status: 403 })
    }

    // 外部リンクは元の URL にリダイレクト
    if (file.fileType === 'link') {
      const meta = (file.metadata ?? {}) as Record<string, unknown>
      const externalUrl = meta['externalUrl']
      if (typeof externalUrl === 'string') {
        return NextResponse.redirect(externalUrl)
      }
      return new NextResponse(null, { status: 404 })
    }

    if (!file.storagePath) {
      return new NextResponse(null, { status: 404 })
    }

    const supabase = createServiceRoleClient()

    // サムネが要求され、かつ生成済みならそちらを返す（無ければオリジナルにフォールバック）
    const meta = (file.metadata ?? {}) as Record<string, unknown>
    const thumbnailPath = typeof meta['thumbnailPath'] === 'string' ? meta['thumbnailPath'] : null
    const useThumb = wantThumb && thumbnailPath !== null

    let { data, error: storageError } = await supabase.storage
      .from('chat-attachments')
      .download(useThumb ? thumbnailPath! : file.storagePath)

    // サムネ取得に失敗した場合はオリジナルにフォールバックする
    let servedThumb = useThumb
    if (useThumb && (storageError || !data)) {
      servedThumb = false
      ;({ data, error: storageError } = await supabase.storage
        .from('chat-attachments')
        .download(file.storagePath))
    }

    if (storageError || !data) {
      console.error('[/api/attachments/[fileId]] Storage download failed:', storageError)
      return new NextResponse(null, { status: 502 })
    }

    return new NextResponse(data, {
      headers: {
        'Content-Type': servedThumb
          ? 'image/jpeg'
          : resolveResponseContentType(file.fileName, file.mimeType),
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    console.error('[/api/attachments/[fileId]] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const { fileId } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }
  const payload = body as { isLatest?: unknown; fileName?: unknown }
  const hasIsLatest = Object.prototype.hasOwnProperty.call(payload, 'isLatest')
  const hasFileName = Object.prototype.hasOwnProperty.call(payload, 'fileName')
  if (hasIsLatest === hasFileName) {
    return NextResponse.json({ error: 'isLatest または fileName のどちらか一方を指定してください' }, { status: 400 })
  }

  const isLatest = payload.isLatest
  if (hasIsLatest && typeof isLatest !== 'boolean') {
    return NextResponse.json({ error: 'isLatest は boolean で指定してください' }, { status: 400 })
  }

  const fileName = typeof payload.fileName === 'string' ? payload.fileName.trim() : null
  if (hasFileName && (!fileName || fileName.length > 255 || /[\u0000-\u001f\u007f]/.test(fileName))) {
    return NextResponse.json({ error: 'ファイル名は1〜255文字で指定してください' }, { status: 400 })
  }

  try {
    const { db, files } = await import('@cairn/db')
    const { eq, sql } = await import('drizzle-orm')

    const [file] = await db
      .select({
        id: files.id,
        workspaceId: files.workspaceId,
        projectId: files.projectId,
        uploadedBy: files.uploadedBy,
        fileName: files.fileName,
        fileType: files.fileType,
        metadata: files.metadata,
      })
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1)

    if (!file) return new NextResponse(null, { status: 404 })
    const canAccess = await canAccessFile(ctx.workspaceId, ctx.userId, file, ctx.role)
    if (!canAccess) return new NextResponse(null, { status: 403 })

    if (fileName) {
      if (file.fileType !== 'link' && extensionOf(fileName) !== extensionOf(file.fileName)) {
        return NextResponse.json({ error: 'ファイルの拡張子は変更できません' }, { status: 400 })
      }
      await db.update(files).set({ fileName }).where(eq(files.id, fileId))
      return NextResponse.json({ success: true, fileName })
    }

    // 最新版ラベルは複数ファイルに同時付与できる（排他にしない）
    const meta = (file.metadata ?? {}) as Record<string, unknown>
    await db
      .update(files)
      .set({
        metadata: isLatest ? { ...meta, isLatest: true } : sql`${files.metadata} - 'isLatest'`,
      })
      .where(eq(files.id, fileId))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[PATCH /api/attachments/[fileId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const { fileId } = await params

  try {
    const { db, files, documentChunks } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    const [file] = await db
      .select({
        id: files.id,
        workspaceId: files.workspaceId,
        projectId: files.projectId,
        storagePath: files.storagePath,
        fileSize: files.fileSize,
        derivedFileSize: files.derivedFileSize,
        uploadedBy: files.uploadedBy,
        fileType: files.fileType,
        metadata: files.metadata,
      })
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1)

    if (!file) return new NextResponse(null, { status: 404 })
    const canAccess = await canAccessFile(ctx.workspaceId, ctx.userId, file, ctx.role)
    if (!canAccess) return new NextResponse(null, { status: 403 })

    // ベクトルデータを先に削除
    await db
      .delete(documentChunks)
      .where(and(eq(documentChunks.sourceType, 'file'), eq(documentChunks.sourceId, fileId)))

    // DB削除と使用量カウンタの更新を同一トランザクションにする。
    // 先に行ロックを取り、同時 DELETE の後続リクエストが二重に減算しないようにする。
    // （プロジェクト削除のCASCADE経路は日次reconciliationで回収する。）
    const deleted = await db.transaction(async (tx) => {
      const [lockedFile] = await tx
        .select({ id: files.id })
        .from(files)
        .where(eq(files.id, fileId))
        .for('update')
        .limit(1)
      if (!lockedFile) return false

      const [deletedFile] = await tx
        .delete(files)
        .where(eq(files.id, fileId))
        .returning({ id: files.id })
      if (!deletedFile) return false

      const { recordStorageUsageDelta } = await import('@/lib/billing/storage-usage')
      await recordStorageUsageDelta(
        file.workspaceId,
        {
          originalBytes: -(file.fileSize ?? 0),
          derivedBytes: -(file.derivedFileSize ?? 0),
        },
        tx,
      )
      return true
    })

    if (!deleted) return new NextResponse(null, { status: 404 })

    // 外部リンクはストレージオブジェクトなし。サムネがあれば併せて削除する
    if (file.fileType !== 'link' && file.storagePath) {
      const meta = (file.metadata ?? {}) as Record<string, unknown>
      const thumbnailPath = typeof meta['thumbnailPath'] === 'string' ? meta['thumbnailPath'] : null
      const { inngest } = await import('@/lib/inngest/client')
      await inngest.send({
        name: 'storage/objects.delete',
        data: {
          bucket: 'chat-attachments',
          paths: thumbnailPath ? [file.storagePath, thumbnailPath] : [file.storagePath],
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/attachments/[fileId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
