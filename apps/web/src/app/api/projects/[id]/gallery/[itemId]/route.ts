// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createServiceRoleClient } from '@/lib/supabase/service'

const GALLERY_BUCKET = 'gallery'

type RouteContext = { params: Promise<{ id: string; itemId: string }> }

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id: projectId, itemId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  if (!process.env['DATABASE_URL']) {
    return new NextResponse(null, { status: 204 })
  }

  try {
    const { db, galleryItems, files, projects } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!project) return new NextResponse(null, { status: 404 })

    const [item] = await db
      .select({ fileId: galleryItems.fileId, storagePath: files.storagePath })
      .from(galleryItems)
      .innerJoin(files, eq(galleryItems.fileId, files.id))
      .where(and(eq(galleryItems.id, itemId), eq(galleryItems.projectId, projectId)))
      .limit(1)

    if (!item) return new NextResponse(null, { status: 404 })

    const supabase = createServiceRoleClient()
    const { error: storageError } = await supabase.storage.from(GALLERY_BUCKET).remove([item.storagePath])
    if (storageError) {
      console.error('[/api/projects/[id]/gallery/[itemId] DELETE] Storage remove failed:', storageError)
      return NextResponse.json({ error: 'ファイルの削除に失敗しました' }, { status: 500 })
    }

    // files を削除すると gallery_items は CASCADE で削除される
    await db.delete(files).where(eq(files.id, item.fileId))

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[/api/projects/[id]/gallery/[itemId] DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
