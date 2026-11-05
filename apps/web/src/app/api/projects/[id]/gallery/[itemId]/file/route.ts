// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { resolveUploadEntitlements } from '@/lib/billing/entitlements'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireProjectAccess } from '@/lib/permissions'
import { GALLERY_BUCKET, GALLERY_ORIGINALS_BUCKET } from '@/lib/gallery-upload'
import { createServiceRoleClient } from '@/lib/supabase/service'

type RouteContext = { params: Promise<{ id: string; itemId: string }> }

// 表示は全員に圧縮派生を返す。原本は `?original=1` のときだけ、Solo 支援者本人
// （課金無効なら全員）にダウンロード名つきの短期署名 URL で渡す。パスは直接公開しない。
export async function GET(req: Request, { params }: RouteContext) {
  const { id: projectId, itemId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const wantOriginal = new URL(req.url).searchParams.get('original') === '1'

  try {
    const { db, files, galleryItems, projects } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)
    if (!project) return new NextResponse(null, { status: 404 })
    const forbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, projectId, ctx.role)
    if (forbidden) return forbidden

    const [item] = await db
      .select({
        fileName: files.fileName,
        storagePath: files.storagePath,
        derivedStoragePath: files.derivedStoragePath,
        mimeType: files.mimeType,
        derivedMimeType: files.derivedMimeType,
      })
      .from(galleryItems)
      .innerJoin(files, eq(galleryItems.fileId, files.id))
      .where(and(eq(galleryItems.id, itemId), eq(galleryItems.projectId, projectId)))
      .limit(1)
    if (!item) return new NextResponse(null, { status: 404 })

    const supabase = createServiceRoleClient()

    if (wantOriginal) {
      const entitlements = await resolveUploadEntitlements(ctx.workspaceId, ctx.userId)
      if (!entitlements.rights.canDownloadOriginal) {
        return NextResponse.json(
          {
            error: '原本の画像をダウンロードするには、本人の Solo 支援とワークスペースの残高が必要です',
            code: 'original-download-entitlement-required',
          },
          { status: 403 },
        )
      }
      // 圧縮版しか無い写真（支援前のアップロード）は原本が存在しない。圧縮版を原本として渡さない
      if (!item.storagePath || !item.derivedStoragePath) {
        return NextResponse.json({ error: 'この写真には原本が保存されていません' }, { status: 404 })
      }
      const { data: signed, error: signedError } = await supabase.storage
        .from(GALLERY_ORIGINALS_BUCKET)
        .createSignedUrl(item.storagePath, 60, { download: item.fileName })
      if (signedError || !signed) {
        console.error('[/api/projects/[id]/gallery/[itemId]/file GET] Original signed URL failed:', signedError)
        return NextResponse.json({ error: '原本の取得に失敗しました' }, { status: 502 })
      }
      return NextResponse.redirect(signed.signedUrl, {
        status: 302,
        headers: { 'Cache-Control': 'private, no-store' },
      })
    }

    // 旧データ（原本と派生を分ける前）は storagePath が gallery バケットの表示用画像を指す
    const derivedPath = item.derivedStoragePath ?? item.storagePath
    if (!derivedPath) return new NextResponse(null, { status: 404 })
    const { data, error: storageError } = await supabase.storage
      .from(GALLERY_BUCKET)
      .download(derivedPath)
    if (storageError || !data) {
      console.error(
        '[/api/projects/[id]/gallery/[itemId]/file GET] Storage download failed:',
        storageError,
      )
      return NextResponse.json({ error: '画像の取得に失敗しました' }, { status: 502 })
    }

    return new NextResponse(data, {
      headers: {
        'Content-Type': (item.derivedMimeType ?? item.mimeType) ?? 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    console.error('[/api/projects/[id]/gallery/[itemId]/file GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
