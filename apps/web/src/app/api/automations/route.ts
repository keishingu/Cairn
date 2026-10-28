// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'
import { AutomationError, createAutomation, createAutomationSchema, listAutomations } from '@/lib/ai/automations'

// 一覧は member 以上が見られる（指示文・作成者を公開して、誰が何をさせているかを隠さない。ai-automation-design.md §2.5）
export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const forbidden = requireRole(ctx.role, 'member')
  if (forbidden) return forbidden
  try {
    return NextResponse.json(await listAutomations(ctx))
  } catch (err) {
    console.error('[GET /api/automations]', err)
    return NextResponse.json({ error: 'オートメーションを取得できませんでした' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const forbidden = requireRole(ctx.role, 'admin')
  if (forbidden) return forbidden

  const parsed = createAutomationSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '入力が不正です' }, { status: 422 })
  }
  try {
    return NextResponse.json(await createAutomation(ctx, parsed.data), { status: 201 })
  } catch (err) {
    if (err instanceof AutomationError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[POST /api/automations]', err)
    return NextResponse.json({ error: 'オートメーションを作成できませんでした' }, { status: 500 })
  }
}
