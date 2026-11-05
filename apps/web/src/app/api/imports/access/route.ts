// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { isWorkspaceAdmin } from '@/lib/permissions'
import { isImportOperator } from '@/lib/imports/operators'

/**
 * 取り込み画面を出してよいか（運営者で、このワークスペースの owner / admin）。設定の入口を出し分けるためだけに使い、
 * 判定の正は取り込み API の withImportAdmin
 */
export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  return NextResponse.json({ allowed: isWorkspaceAdmin(ctx.role) && isImportOperator(ctx.userId) })
}
