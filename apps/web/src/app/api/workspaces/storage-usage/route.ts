// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

// Phase 0（計測）: 制限・課金はまだかけない。詳細は docs/billing-implementation-design.md
export interface WorkspaceStorageUsageDto {
  originalBytes: number
  derivedBytes: number
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, workspaceStorageUsage } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const [row] = await db
      .select({ originalBytes: workspaceStorageUsage.originalBytes, derivedBytes: workspaceStorageUsage.derivedBytes })
      .from(workspaceStorageUsage)
      .where(eq(workspaceStorageUsage.workspaceId, ctx.workspaceId))
      .limit(1)

    return NextResponse.json({
      originalBytes: row?.originalBytes ?? 0,
      derivedBytes: row?.derivedBytes ?? 0,
    } satisfies WorkspaceStorageUsageDto)
  } catch (err) {
    console.error('[/api/workspaces/storage-usage GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
