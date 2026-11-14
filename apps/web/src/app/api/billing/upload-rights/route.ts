// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { resolveUploadEntitlements } from '@/lib/billing/entitlements'
import { getAuthContext } from '@/lib/get-auth-context'

export interface UploadRightsDto {
  canUploadVideo: boolean
  canDownloadOriginal: boolean
}

// UI の出し分け用に、自分（このワークスペースの Solo 支援者本人か、課金無効か）の権利を返す。
// 判定の正は各アップロード・取得ルートで、ここはメニューを出すかどうかの補助にだけ使う。
// ゲストも添付・ギャラリーを使うため、ロールでは絞らない
export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { rights } = await resolveUploadEntitlements(ctx.workspaceId, ctx.userId)
    return NextResponse.json(
      {
        canUploadVideo: rights.canUploadVideo,
        canDownloadOriginal: rights.canDownloadOriginal,
      } satisfies UploadRightsDto,
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (err) {
    console.error('[/api/billing/upload-rights GET]', err)
    return NextResponse.json({ error: '支援状態を取得できませんでした' }, { status: 500 })
  }
}
