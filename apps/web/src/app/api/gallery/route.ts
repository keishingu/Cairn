// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { getGuestVisibleProjectIds, getWorkspaceMemberRole } from '@/lib/permissions'
import { createServiceRoleClient } from '@/lib/supabase/service'

const GALLERY_BUCKET = 'gallery'

export interface WorkspaceGalleryItemDto {
  id: string
  fileId: string
  publicUrl: string
  takenAt: string | null
  createdAt: string
  projectId: string
  projectTitle: string
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, galleryItems, files, projects } = await import('@cairn/db')
    const { eq, and, isNotNull, inArray, sql } = await import('drizzle-orm')

    // ゲストは参加プロジェクトのギャラリーのみ閲覧可
    const role = await getWorkspaceMemberRole(ctx.workspaceId, ctx.userId)
    let guestProjectIds: string[] | null = null
    if (role === 'guest') {
      guestProjectIds = await getGuestVisibleProjectIds(ctx.workspaceId, ctx.userId)
      if (guestProjectIds.length === 0) return NextResponse.json([] satisfies WorkspaceGalleryItemDto[])
    }

    const rows = await db
      .select({
        id: galleryItems.id,
        fileId: galleryItems.fileId,
        storagePath: files.storagePath,
        takenAt: galleryItems.takenAt,
        createdAt: galleryItems.createdAt,
        projectId: projects.id,
        projectTitle: projects.title,
      })
      .from(galleryItems)
      .innerJoin(files, eq(galleryItems.fileId, files.id))
      .innerJoin(projects, eq(galleryItems.projectId, projects.id))
      .where(and(
        eq(projects.workspaceId, ctx.workspaceId),
        isNotNull(files.storagePath),
        ...(guestProjectIds ? [inArray(projects.id, guestProjectIds)] : []),
      ))
      .orderBy(sql`${galleryItems.takenAt} DESC NULLS LAST`, sql`${galleryItems.createdAt} DESC`)

    const supabase = createServiceRoleClient()
    const result: WorkspaceGalleryItemDto[] = rows.map((r: typeof rows[number]) => ({
      id: r.id,
      fileId: r.fileId,
      publicUrl: supabase.storage.from(GALLERY_BUCKET).getPublicUrl(r.storagePath!).data.publicUrl,
      takenAt: r.takenAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      projectId: r.projectId,
      projectTitle: r.projectTitle,
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/gallery GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
