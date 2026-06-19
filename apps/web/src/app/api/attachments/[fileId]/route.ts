// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createServiceRoleClient } from '@/lib/supabase/service'

type RouteContext = { params: Promise<{ fileId: string }> }

export async function GET(req: Request, { params }: RouteContext) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const { fileId } = await params

  // 一覧アイコン・チャットのサムネは ?thumb=1 で縮小版を要求する
  const wantThumb = new URL(req.url).searchParams.get('thumb') === '1'

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

    // 同一ワークスペースのメンバーのみ閲覧可（Phase 2 で公開/非公開プロジェクトの判定を追加する）
    if (file.workspaceId !== ctx.workspaceId) {
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
        'Content-Type': servedThumb ? 'image/jpeg' : (file.mimeType ?? 'application/octet-stream'),
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    console.error('[/api/attachments/[fileId]] Error:', err)
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
      .select({ id: files.id, workspaceId: files.workspaceId, storagePath: files.storagePath, uploadedBy: files.uploadedBy, fileType: files.fileType, metadata: files.metadata })
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1)

    if (!file) return new NextResponse(null, { status: 404 })
    if (file.workspaceId !== ctx.workspaceId) return new NextResponse(null, { status: 403 })

    // ベクトルデータを先に削除
    await db
      .delete(documentChunks)
      .where(and(eq(documentChunks.sourceType, 'file'), eq(documentChunks.sourceId, fileId)))

    // DB から削除（message_attachments は CASCADE で連鎖削除）
    await db.delete(files).where(eq(files.id, fileId))

    // 外部リンクはストレージオブジェクトなし。サムネがあれば併せて削除する
    if (file.fileType !== 'link' && file.storagePath) {
      const meta = (file.metadata ?? {}) as Record<string, unknown>
      const thumbnailPath = typeof meta['thumbnailPath'] === 'string' ? meta['thumbnailPath'] : null
      const { inngest } = await import('@/lib/inngest/client')
      await inngest.send({
        name: 'storage/objects.delete',
        data: { bucket: 'chat-attachments', paths: thumbnailPath ? [file.storagePath, thumbnailPath] : [file.storagePath] },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/attachments/[fileId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
