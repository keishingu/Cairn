// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext, type AuthContext } from '@/lib/get-auth-context'
import { ResearchAccessError } from './workspace-research'

// `/api/research/*` の共通処理。MCP の読み取り tool がこの Route Handler を呼ぶ（mcp-server-design.md §6）。
// PAT / MCP OAuth の read scope を受け付け、`/ai` の tool と同じ調査関数を実行する。
export async function researchRoute<T>(
  req: Request,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  read: (ctx: AuthContext, input: T) => Promise<unknown>,
  label: string,
): Promise<Response> {
  const { ctx, error } = await getAuthContext({ allowApiToken: true, requiredApiTokenScope: 'read' })
  if (error) return error

  const params = new URL(req.url).searchParams
  const raw: Record<string, string | string[]> = {}
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key)
    raw[key] = values.length > 1 ? values : values[0]!
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'クエリパラメータが不正です', details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  try {
    const result = await read(ctx, parsed.data)
    if (typeof result === 'object' && result !== null && (result as { ok?: unknown }).ok === false) {
      return NextResponse.json(result, { status: 422 })
    }
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof ResearchAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    console.error(`[${label}]`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const queryBoolean = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional()

export const queryLimit = z.coerce.number().int().positive().optional()

// 単一値でも配列で受け取る（`?attribute=a&attribute=b` と `?attribute=a` の両方）
export function queryArray<T extends z.ZodTypeAny>(item: T) {
  return z
    .union([item, z.array(item)])
    .transform((value) => (Array.isArray(value) ? value : [value]) as z.infer<T>[])
    .optional()
}
