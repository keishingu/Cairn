// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'
import type { WorkspaceCoverPhoto } from '@cairn/db'

export type { WorkspaceCoverPhoto }

const COVERS_BUCKET = 'covers'
const MAX_FILE_SIZE = 20 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
])

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db } = await import('@cairn/db')
    const { workspaces } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const [ws] = await db
      .select({ settings: workspaces.settings })
      .from(workspaces)
      .where(eq(workspaces.id, ctx.workspaceId))
      .limit(1)

    return NextResponse.json((ws?.settings?.coverPhotos ?? []) satisfies WorkspaceCoverPhoto[])
  } catch (err) {
    console.error('[/api/workspaces/cover-photos] GET failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const forbidden = requireRole(ctx.role, 'admin')
  if (forbidden) return forbidden

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
    return NextResponse.json(
      { error: '対応していない形式です（JPEG・PNG・GIF・WEBP・HEIC）' },
      { status: 400 },
    )
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'ファイルサイズは 20MB 以下にしてください' },
      { status: 400 },
    )
  }

  try {
    const { db } = await import('@cairn/db')
    const { workspaces } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')
    const { createServiceRoleClient } = await import('@/lib/supabase/service')

    const ext = file.name.split('.').pop() ?? 'jpg'
    const photoId = crypto.randomUUID()
    const storagePath = `${ctx.workspaceId}/${photoId}.${ext}`

    const buffer = await file.arrayBuffer()
    const supabase = createServiceRoleClient()

    const { error: uploadError } = await supabase.storage
      .from(COVERS_BUCKET)
      .upload(storagePath, buffer, { contentType: file.type, upsert: false })

    if (uploadError) {
      console.error('[/api/workspaces/cover-photos] Storage upload failed:', uploadError)
      return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage.from(COVERS_BUCKET).getPublicUrl(storagePath)

    const [ws] = await db
      .select({ settings: workspaces.settings })
      .from(workspaces)
      .where(eq(workspaces.id, ctx.workspaceId))
      .limit(1)

    const newPhoto: WorkspaceCoverPhoto = {
      id: photoId,
      url: publicUrl,
      storagePath,
      name: file.name,
    }

    const existing = ws?.settings?.coverPhotos ?? []
    const merged = { ...(ws?.settings ?? {}), coverPhotos: [...existing, newPhoto] }

    await db
      .update(workspaces)
      .set({ settings: merged, updatedAt: new Date() })
      .where(eq(workspaces.id, ctx.workspaceId))

    return NextResponse.json(newPhoto, { status: 201 })
  } catch (err) {
    console.error('[/api/workspaces/cover-photos] POST failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const forbidden = requireRole(ctx.role, 'admin')
  if (forbidden) return forbidden

  let body: { id: string } | null = null
  try {
    body = await req.json() as { id: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body?.id) {
    return NextResponse.json({ error: 'id は必須です' }, { status: 400 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { workspaces } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')
    const { createServiceRoleClient } = await import('@/lib/supabase/service')

    const [ws] = await db
      .select({ settings: workspaces.settings })
      .from(workspaces)
      .where(eq(workspaces.id, ctx.workspaceId))
      .limit(1)

    const existing = ws?.settings?.coverPhotos ?? []
    const target = existing.find(p => p.id === body.id)

    if (!target) {
      return NextResponse.json({ error: '写真が見つかりません' }, { status: 404 })
    }

    const supabase = createServiceRoleClient()
    await supabase.storage.from(COVERS_BUCKET).remove([target.storagePath])

    const merged = {
      ...(ws?.settings ?? {}),
      coverPhotos: existing.filter(p => p.id !== body.id),
    }

    await db
      .update(workspaces)
      .set({ settings: merged, updatedAt: new Date() })
      .where(eq(workspaces.id, ctx.workspaceId))

    return new Response(null, { status: 204 })
  } catch (err) {
    console.error('[/api/workspaces/cover-photos] DELETE failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
