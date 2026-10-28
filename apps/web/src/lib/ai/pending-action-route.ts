// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext, type AuthContext } from '@/lib/get-auth-context'
import { PendingActionError, type PendingActionDto } from './pending-actions'

// 承認カードの API の共通処理。実行案は承認者本人のセッションだけで扱い、PAT・MCP には開かない
// （外部の AI が承認を代行できると、人間の承認を挟む意味がなくなる）
export async function pendingActionRoute(
  params: Promise<{ id: string }>,
  run: (ctx: AuthContext, id: string) => Promise<PendingActionDto>,
  label: string,
): Promise<Response> {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: '実行案が見つかりません' }, { status: 404 })
  }
  try {
    return NextResponse.json(await run(ctx, id))
  } catch (err) {
    if (err instanceof PendingActionError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error(`[${label}]`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
