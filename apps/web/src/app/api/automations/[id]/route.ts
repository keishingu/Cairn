// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'
import { AutomationError, deleteAutomation, updateAutomation, updateAutomationSchema } from '@/lib/ai/automations'

type RouteContext = { params: Promise<{ id: string }> }

async function adminContext(params: RouteContext['params']) {
  const { ctx, error } = await getAuthContext()
  if (error) return { error }
  const forbidden = requireRole(ctx.role, 'admin')
  if (forbidden) return { error: forbidden }
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return { error: NextResponse.json({ error: 'オートメーションが見つかりません' }, { status: 404 }) }
  }
  return { ctx, id }
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const resolved = await adminContext(params)
  if ('error' in resolved) return resolved.error
  const parsed = updateAutomationSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '入力が不正です' }, { status: 422 })
  }
  try {
    return NextResponse.json(await updateAutomation(resolved.ctx, resolved.id, parsed.data))
  } catch (err) {
    if (err instanceof AutomationError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[PATCH /api/automations/[id]]', err)
    return NextResponse.json({ error: 'オートメーションを更新できませんでした' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const resolved = await adminContext(params)
  if ('error' in resolved) return resolved.error
  try {
    await deleteAutomation(resolved.ctx, resolved.id)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    if (err instanceof AutomationError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[DELETE /api/automations/[id]]', err)
    return NextResponse.json({ error: 'オートメーションを削除できませんでした' }, { status: 500 })
  }
}
