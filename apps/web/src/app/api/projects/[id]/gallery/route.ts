// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireProjectAccess } from '@/lib/permissions'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { GALLERY_BUCKET } from '@/lib/gallery-upload'

export interface GalleryItemDto {
  id: string
  fileId: string
  publicUrl: string
  originalUrl: string | null
  takenAt: string | null
  createdAt: string
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const { id: projectId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, galleryItems, files, projects } = await import('@cairn/db')
    const { eq, and, desc, sql } = await import('drizzle-orm')

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!project) return new NextResponse(null, { status: 404 })

    // ゲストは参加プロジェクトのギャラリーのみ閲覧可
    const forbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, projectId, ctx.role)
    if (forbidden) return forbidden

    const rows = await db
      .select({
        id: galleryItems.id,
        fileId: galleryItems.fileId,
        storagePath: files.storagePath,
        derivedStoragePath: files.derivedStoragePath,
        takenAt: galleryItems.takenAt,
        createdAt: galleryItems.createdAt,
      })
      .from(galleryItems)
      .innerJoin(files, eq(galleryItems.fileId, files.id))
      .where(
        and(
          eq(galleryItems.projectId, projectId),
          sql`coalesce(${files.derivedStoragePath}, ${files.storagePath}) is not null`,
        ),
      )
      .orderBy(sql`${galleryItems.takenAt} DESC NULLS LAST`, desc(galleryItems.createdAt))

    const supabase = createServiceRoleClient()
    const result: GalleryItemDto[] = rows.map((r: (typeof rows)[number]) => ({
      id: r.id,
      fileId: r.fileId,
      publicUrl: supabase.storage
        .from(GALLERY_BUCKET)
        .getPublicUrl(r.derivedStoragePath ?? r.storagePath!).data.publicUrl,
      originalUrl: r.storagePath ? `/api/projects/${projectId}/gallery/${r.id}/file` : null,
      takenAt: r.takenAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/projects/[id]/gallery GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(_req: Request, _context: RouteContext) {
  void _req
  void _context
  return NextResponse.json(
    {
      error: 'このアップロード方式は利用できません。アップロードURLを発行してから確定してください',
    },
    { status: 410 },
  )
}
