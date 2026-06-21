// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireWorkspaceOwner } from '@/lib/permissions'

const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const BUCKET = 'workspace-logos'

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const forbidden = await requireWorkspaceOwner(ctx.workspaceId, ctx.userId)
  if (forbidden) return forbidden

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file は必須です' }, { status: 400 })
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: '対応していないファイル形式です（JPEG・PNG・GIF・WebP）' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'ファイルサイズは 5MB 以下にしてください' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'jpg'
  const storagePath = `${ctx.workspaceId}.${ext}`

  const { createServiceRoleClient } = await import('@/lib/supabase/service')
  const supabase = createServiceRoleClient()
  const buffer = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: true })

  if (uploadError) {
    console.error('[POST /api/workspaces/logo] Storage upload failed:', uploadError)
    return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)

  try {
    const { db, workspaces } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    await db
      .update(workspaces)
      .set({ logoUrl: publicUrl, updatedAt: new Date() })
      .where(eq(workspaces.id, ctx.workspaceId))

    return NextResponse.json({ logoUrl: publicUrl })
  } catch (err) {
    await supabase.storage.from(BUCKET).remove([storagePath])
    console.error('[POST /api/workspaces/logo] DB update failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
