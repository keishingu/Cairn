// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'
import { DryRunError, dryRunSkill } from '@/lib/ai/skill-dry-run'

// ツールで読み、判断まで行うため、通常の API より長くかかる
export const maxDuration = 300

const bodySchema = z.object({ request: z.string().max(2000).default('') }).strict()

// テスト実行は設定画面の admin 以上だけ（オートメーションを作れる人が試す。ai-automation-design.md §2.9）
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const forbidden = requireRole(ctx.role, 'admin')
  if (forbidden) return forbidden
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'スキルが見つかりません' }, { status: 404 })
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: '追加の依頼は2,000文字以内にしてください' }, { status: 422 })
  try {
    return NextResponse.json(await dryRunSkill(ctx, id, parsed.data.request))
  } catch (err) {
    if (err instanceof DryRunError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[POST /api/automations/[id]/dry-run]', err)
    return NextResponse.json({ error: 'テスト実行に失敗しました' }, { status: 500 })
  }
}
