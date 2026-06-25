// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { canAccessFile } from '@/lib/permissions'
import { createServiceRoleClient } from '@/lib/supabase/service'

type RouteContext = { params: Promise<{ fileId: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const { fileId } = await params

  try {
    const { db, files } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const [file] = await db
      .select()
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1)

    if (!file) {
      return new NextResponse(null, { status: 404 })
    }

    const canAccess = await canAccessFile(ctx.workspaceId, ctx.userId, file)
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
    const { data, error: storageError } = await supabase.storage
      .from('chat-attachments')
      .download(file.storagePath)

    if (storageError || !data) {
      console.error('[/api/attachments/[fileId]] Storage download failed:', storageError)
      return new NextResponse(null, { status: 502 })
    }

    const mimeType = file.mimeType ?? 'application/octet-stream'
    const isText = mimeType.startsWith('text/') || mimeType === 'application/json'

    return new NextResponse(data, {
      headers: {
        'Content-Type': isText ? `${mimeType}; charset=utf-8` : mimeType,
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
  const isLatest = (body as { isLatest?: unknown })?.isLatest
  if (typeof isLatest !== 'boolean') {
    return NextResponse.json({ error: 'isLatest は boolean で指定してください' }, { status: 400 })
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
        metadata: files.metadata,
      })
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1)

    if (!file) return new NextResponse(null, { status: 404 })
    const canAccess = await canAccessFile(ctx.workspaceId, ctx.userId, file)
    if (!canAccess) return new NextResponse(null, { status: 403 })

    // 最新版ラベルは複数ファイルに同時付与できる（排他にしない）
    const meta = (file.metadata ?? {}) as Record<string, unknown>
    await db
      .update(files)
      .set({ metadata: isLatest ? { ...meta, isLatest: true } : sql`${files.metadata} - 'isLatest'` })
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
        uploadedBy: files.uploadedBy,
        fileType: files.fileType,
        metadata: files.metadata,
      })
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1)

    if (!file) return new NextResponse(null, { status: 404 })
    const canAccess = await canAccessFile(ctx.workspaceId, ctx.userId, file)
    if (!canAccess) return new NextResponse(null, { status: 403 })

    // ベクトルデータを先に削除
    await db
      .delete(documentChunks)
      .where(and(eq(documentChunks.sourceType, 'file'), eq(documentChunks.sourceId, fileId)))

    // DB から削除（message_attachments は CASCADE で連鎖削除）
    await db.delete(files).where(eq(files.id, fileId))

    // 外部リンクはストレージオブジェクトなし
    if (file.fileType !== 'link' && file.storagePath) {
      const { inngest } = await import('@/lib/inngest/client')
      await inngest.send({
        name: 'storage/objects.delete',
        data: { bucket: 'chat-attachments', paths: [file.storagePath] },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/attachments/[fileId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
