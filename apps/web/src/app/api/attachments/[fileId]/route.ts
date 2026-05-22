// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createServiceRoleClient } from '@/lib/supabase/service'

type RouteContext = { params: Promise<{ fileId: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  if (!process.env['DATABASE_URL']) {
    return new NextResponse(null, { status: 404 })
  }

  const { fileId } = await params

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

    const supabase = createServiceRoleClient()
    const { data, error: storageError } = await supabase.storage
      .from('chat-attachments')
      .download(file.storagePath)

    if (storageError || !data) {
      console.error('[/api/attachments/[fileId]] Storage download failed:', storageError)
      return new NextResponse(null, { status: 502 })
    }

    return new NextResponse(data, {
      headers: {
        'Content-Type': file.mimeType ?? 'application/octet-stream',
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    console.error('[/api/attachments/[fileId]] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
