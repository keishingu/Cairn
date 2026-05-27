// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createServiceRoleClient } from '@/lib/supabase/service'

const GALLERY_BUCKET = 'gallery'
const MAX_FILE_SIZE = 20 * 1024 * 1024
// クライアント側で HEIC → JPEG 変換・リサイズ済みのため JPEG のみ受け付ける
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
])

export interface GalleryItemDto {
  id: string
  fileId: string
  publicUrl: string
  takenAt: string | null
  createdAt: string
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const { id: projectId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json([] satisfies GalleryItemDto[])
  }

  try {
    const { db, galleryItems, files, projects } = await import('@cairn/db')
    const { eq, and, desc, isNotNull, sql } = await import('drizzle-orm')

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!project) return new NextResponse(null, { status: 404 })

    const rows = await db
      .select({
        id: galleryItems.id,
        fileId: galleryItems.fileId,
        storagePath: files.storagePath,
        takenAt: galleryItems.takenAt,
        createdAt: galleryItems.createdAt,
      })
      .from(galleryItems)
      .innerJoin(files, eq(galleryItems.fileId, files.id))
      .where(and(eq(galleryItems.projectId, projectId), isNotNull(files.storagePath)))
      .orderBy(sql`${galleryItems.takenAt} DESC NULLS LAST`, desc(galleryItems.createdAt))

    const supabase = createServiceRoleClient()
    const result: GalleryItemDto[] = rows.map((r: typeof rows[number]) => ({
      id: r.id,
      fileId: r.fileId,
      publicUrl: supabase.storage.from(GALLERY_BUCKET).getPublicUrl(r.storagePath!).data.publicUrl,
      takenAt: r.takenAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/projects/[id]/gallery GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  const { id: projectId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json({ error: 'ローカル開発モードではアップロードは利用できません' }, { status: 501 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file は必須です' }, { status: 400 })
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: '対応していない形式です（JPEG・PNG・GIF・WEBP）' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'ファイルサイズは 20MB 以下にしてください' }, { status: 400 })
  }

  // Canvas 処理で EXIF が剥がれるため、処理前にクライアントで抽出したものをフォームフィールドで受け取る
  const takenAtRaw = formData.get('takenAt')
  const takenAt: Date | null = typeof takenAtRaw === 'string' ? new Date(takenAtRaw) : null

  const latRaw = formData.get('latitude')
  const lngRaw = formData.get('longitude')
  const latitude: string | null = typeof latRaw === 'string' ? latRaw : null
  const longitude: string | null = typeof lngRaw === 'string' ? lngRaw : null

  try {
    const { db, files, galleryItems, projects } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!project) return new NextResponse(null, { status: 404 })

    const ext = file.name.split('.').pop() ?? 'jpg'
    const storagePath = `${ctx.workspaceId}/${projectId}/${crypto.randomUUID()}.${ext}`

    const buffer = await file.arrayBuffer()

    const supabase = createServiceRoleClient()
    const { error: uploadError } = await supabase.storage
      .from(GALLERY_BUCKET)
      .upload(storagePath, buffer, { contentType: file.type, upsert: false })

    if (uploadError) {
      console.error('[/api/projects/[id]/gallery POST] Storage upload failed:', uploadError)
      return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
    }

    try {
      const [insertedFile] = await db
        .insert(files)
        .values({
          workspaceId: ctx.workspaceId,
          projectId,
          uploadedBy: ctx.userId,
          storagePath,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          fileType: 'image',
        })
        .returning()

      if (!insertedFile) throw new Error('files insert returned no rows')

      const [insertedItem] = await db
        .insert(galleryItems)
        .values({
          projectId,
          uploadedBy: ctx.userId,
          fileId: insertedFile.id,
          takenAt,
          latitude,
          longitude,
        })
        .returning()

      if (!insertedItem) throw new Error('gallery_items insert returned no rows')

      const { data: { publicUrl } } = supabase.storage.from(GALLERY_BUCKET).getPublicUrl(storagePath)

      return NextResponse.json({
        id: insertedItem.id,
        fileId: insertedFile.id,
        publicUrl,
        takenAt: insertedItem.takenAt?.toISOString() ?? null,
        createdAt: insertedItem.createdAt.toISOString(),
      } satisfies GalleryItemDto, { status: 201 })
    } catch (dbErr) {
      await supabase.storage.from(GALLERY_BUCKET).remove([storagePath])
      throw dbErr
    }
  } catch (err) {
    console.error('[/api/projects/[id]/gallery POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
