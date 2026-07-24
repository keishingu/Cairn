// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { resolveWorkspaceState } from '@cairn/core'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireProjectAccess } from '@/lib/permissions'
import { GALLERY_BUCKET, GALLERY_ORIGINALS_BUCKET } from '@/lib/gallery-upload'
import { createServiceRoleClient } from '@/lib/supabase/service'

type RouteContext = { params: Promise<{ id: string; itemId: string }> }

// 資金状態なら原本、風化またはFreeなら圧縮派生を返す。パスを直接公開しない。
export async function GET(_req: Request, { params }: RouteContext) {
  const { id: projectId, itemId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, creditLedger, files, galleryItems, projects } = await import('@cairn/db')
    const { and, eq, sql } = await import('drizzle-orm')
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

    const billingEnabled = Boolean(process.env['STRIPE_SECRET_KEY'])
    const [balance] = billingEnabled
      ? await db.select({ value: sql<string>`COALESCE(SUM(${creditLedger.delta}), 0)` })
        .from(creditLedger).where(eq(creditLedger.workspaceId, ctx.workspaceId))
      : [{ value: '0' }]
    const workspaceState = resolveWorkspaceState(Number(balance?.value ?? 0), billingEnabled)
    const useOriginal = workspaceState !== 'weathered' && item.storagePath !== null
    const storagePath = useOriginal ? item.storagePath : item.derivedStoragePath
    if (!storagePath) return new NextResponse(null, { status: 404 })

    const supabase = createServiceRoleClient()
    const { data, error: storageError } = await supabase.storage
      .from(useOriginal ? GALLERY_ORIGINALS_BUCKET : GALLERY_BUCKET)
      .download(storagePath)
    if (storageError || !data) {
      console.error('[/api/projects/[id]/gallery/[itemId]/file GET] Storage download failed:', storageError)
      return NextResponse.json({ error: '画像の取得に失敗しました' }, { status: 502 })
    }

    return new NextResponse(data, {
      headers: {
        'Content-Type': (useOriginal ? item.mimeType : item.derivedMimeType ?? item.mimeType) ?? 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    console.error('[/api/projects/[id]/gallery/[itemId]/file GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
