// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { runForActiveMembership } from '@/lib/access/active-membership-lock'

const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const BUCKET = 'avatars'

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

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
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: '対応していないファイル形式です（JPEG・PNG・GIF・WebP）' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'ファイルサイズは 5MB 以下にしてください' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'jpg'
  const storagePath = `${ctx.workspaceId}/${ctx.userId}.${ext}`

  const { createServiceRoleClient } = await import('@/lib/supabase/service')
  const supabase = createServiceRoleClient()
  const buffer = await file.arrayBuffer()

  let uploaded = false
  try {
    const { db, workspaceMembers } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')
    const publicUrl = await runForActiveMembership(db, ctx.workspaceId, ctx.userId, async (tx) => {
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, buffer, { contentType: file.type, upsert: true })
      if (uploadError) throw uploadError
      uploaded = true

      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
      await tx
        .update(workspaceMembers)
        .set({ avatarUrl: publicUrl })
        .where(
          and(
            eq(workspaceMembers.userId, ctx.userId),
            eq(workspaceMembers.workspaceId, ctx.workspaceId),
          ),
        )
      return publicUrl
    })
    if (!publicUrl) {
      return NextResponse.json(
        { error: 'ワークスペースへのアクセス権がありません' },
        { status: 403 },
      )
    }
    return NextResponse.json({ avatarUrl: publicUrl })
  } catch (err) {
    if (uploaded) await supabase.storage.from(BUCKET).remove([storagePath])
    console.error('[POST /api/me/avatar] Avatar update failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
