// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'
import { isBillingTestMode } from '@/lib/billing/is-billing-test-mode'

export async function POST(request: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  if (!isBillingTestMode()) return NextResponse.json({ error: 'この環境では利用できません' }, { status: 404 })
  const forbidden = requireRole(ctx.role, 'owner')
  if (forbidden) return forbidden
  let body: { credits?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'リクエスト形式が不正です' }, { status: 400 }) }
  if (typeof body.credits !== 'number' || !Number.isInteger(body.credits) || body.credits < 1 || body.credits > 10_000) {
    return NextResponse.json({ error: 'クレジットは1から10000で指定してください' }, { status: 400 })
  }
  try {
    const { creditLedger, db } = await import('@cairn/db')
    await db.insert(creditLedger).values({
      workspaceId: ctx.workspaceId,
      delta: body.credits,
      reason: 'adjustment',
      refId: `preview-test:${crypto.randomUUID()}`,
    })
    return NextResponse.json({ grantedCredits: body.credits }, { status: 201 })
  } catch (err) {
    console.error('[/api/billing/test-credits POST]', err)
    return NextResponse.json({ error: 'テスト用クレジットの付与に失敗しました' }, { status: 500 })
  }
}
