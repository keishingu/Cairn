// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireWorkspaceAdmin } from '@/lib/permissions'

// 既存の画像ファイルにサムネを後付け生成するバックフィルを起動する（管理者以上）。
// 実処理は Inngest ジョブ（attachments/backfill-thumbnails）が担う。
export async function POST() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const forbidden = await requireWorkspaceAdmin(ctx.workspaceId, ctx.userId)
  if (forbidden) return forbidden

  try {
    const { inngest } = await import('@/lib/inngest/client')
    await inngest.send({
      name: 'attachments/backfill-thumbnails',
      data: { workspaceId: ctx.workspaceId },
    })
    return NextResponse.json({ started: true })
  } catch (err) {
    console.error('[/api/admin/backfill-thumbnails] Inngest send failed:', err)
    return NextResponse.json({ error: 'バックフィルの起動に失敗しました' }, { status: 500 })
  }
}
