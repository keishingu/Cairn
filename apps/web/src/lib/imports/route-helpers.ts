// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'
import { isImportOperator } from './operators'
import { ImportServiceError } from './service'

export interface ImportAdminContext {
  userId: string
  workspaceId: string
}

/**
 * 取り込み API の共通処理。取り込みは過去ログを一括で書き込むので owner / admin だけに許可する。
 * さらに、移行支援をしながら使う前提のため、Cairn の運営者（isImportOperator）に限る。
 * API トークンでは使えない（ブラウザの管理画面からだけ操作する）。
 * エラーは本文・氏名を含めずにログへ出す。
 */
export async function withImportAdmin(
  label: string,
  handler: (ctx: ImportAdminContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const forbidden = requireRole(ctx.role, 'admin')
  if (forbidden) return forbidden
  if (!isImportOperator(ctx.userId)) {
    return NextResponse.json({ error: '外部チャットの取り込みは、移行支援の担当者（Cairn の運営者）だけが利用できます' }, { status: 403 })
  }
  try {
    return await handler({ userId: ctx.userId, workspaceId: ctx.workspaceId })
  } catch (err) {
    if (err instanceof ImportServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    // 取り込みデータ（本文・氏名）をログに出さないよう、エラーの種類とメッセージだけを出す
    console.error(`[imports] ${label} failed:`, err instanceof Error ? `${err.name}: ${err.message.slice(0, 300)}` : 'unknown error')
    return NextResponse.json({ error: '取り込みの処理に失敗しました' }, { status: 500 })
  }
}

export async function parseJsonBody<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<{ data: z.output<S>; error: null } | { data: null; error: NextResponse }> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return { data: null, error: NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 }) }
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    // 検証エラーの詳細には本文が含まれうるので、項目の場所とメッセージだけを返す
    const issues = parsed.error.issues.slice(0, 5).map(issue => ({ path: issue.path.join('.'), message: issue.message }))
    return { data: null, error: NextResponse.json({ error: '取り込みデータの形式が不正です', issues }, { status: 422 }) }
  }
  return { data: parsed.data as z.output<S>, error: null }
}
