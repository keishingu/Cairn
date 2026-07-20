// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

// Phase 0（計測）: 制限・課金はまだかけない。詳細は docs/billing-implementation-design.md #4
// 使用量は files.file_size の都度集約で算出する（専用カウンタは持たない → CASCADE 削除で
// ドリフトしない）。設定画面の時々の閲覧のみで、ホットパスではないため集約1発で十分。
export interface WorkspaceStorageUsageDto {
  originalBytes: number
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, files } = await import('@cairn/db')
    const { eq, sql } = await import('drizzle-orm')

    const [row] = await db
      .select({ originalBytes: sql<string>`COALESCE(SUM(${files.fileSize}), 0)` })
      .from(files)
      .where(eq(files.workspaceId, ctx.workspaceId))

    // SUM(bigint) は numeric を返し drizzle では文字列になるため数値化する
    return NextResponse.json({
      originalBytes: Number(row?.originalBytes ?? 0),
    } satisfies WorkspaceStorageUsageDto)
  } catch (err) {
    console.error('[/api/workspaces/storage-usage GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
