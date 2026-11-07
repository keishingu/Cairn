// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { isWorkspaceAdmin } from '@/lib/permissions'
import { isImportOperator } from '@/lib/imports/operators'

/**
 * 取り込み画面を出してよいか。allowed は取り込み（運営者で、このワークスペースの owner / admin）、
 * canLink は取り込んだ投稿者の紐づけ（owner / admin で、取り込んだ投稿者がいる）。
 * 設定の入口を出し分けるためだけに使い、判定の正は各 API（withImportAdmin / withImportLinker）
 */
export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const admin = isWorkspaceAdmin(ctx.role)
  let canLink = false
  if (admin) {
    const { db, importIdentities } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')
    const [row] = await db.select({ id: importIdentities.id }).from(importIdentities).where(eq(importIdentities.workspaceId, ctx.workspaceId)).limit(1)
    canLink = !!row
  }
  return NextResponse.json({ allowed: admin && isImportOperator(ctx.userId), canLink })
}
