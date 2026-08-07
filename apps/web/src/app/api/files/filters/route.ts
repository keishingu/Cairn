// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import {
  parseSavedFileFilterConditions,
  savedFileFilterInputSchema,
  type SavedFileFilterDto,
} from '@/lib/files/saved-file-filter'

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, savedFileFilters } = await import('@cairn/db')
    const { and, asc, eq } = await import('drizzle-orm')

    const rows = await db
      .select()
      .from(savedFileFilters)
      .where(
        and(
          eq(savedFileFilters.workspaceId, ctx.workspaceId),
          eq(savedFileFilters.userId, ctx.userId),
        ),
      )
      .orderBy(asc(savedFileFilters.createdAt))

    const result = rows.map((row) => {
      const conditions = parseSavedFileFilterConditions(row.conditions)
      if (!conditions) throw new Error(`Invalid saved file filter conditions: ${row.id}`)
      return {
        id: row.id,
        name: row.name,
        conditions,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      } satisfies SavedFileFilterDto
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/files/filters GET]', err)
    return NextResponse.json({ error: '保存済みフィルターの取得に失敗しました' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }

  const parsed = savedFileFilterInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'フィルターの内容が不正です' },
      { status: 400 },
    )
  }

  try {
    const { db, savedFileFilters } = await import('@cairn/db')

    const [row] = await db
      .insert(savedFileFilters)
      .values({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        name: parsed.data.name,
        conditions: parsed.data.conditions,
      })
      .onConflictDoNothing()
      .returning()

    if (!row) {
      return NextResponse.json({ error: '同じ名前のフィルターがすでにあります' }, { status: 409 })
    }

    return NextResponse.json(
      {
        id: row.id,
        name: row.name,
        conditions: parsed.data.conditions,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      } satisfies SavedFileFilterDto,
      { status: 201 },
    )
  } catch (err) {
    console.error('[/api/files/filters POST]', err)
    return NextResponse.json({ error: 'フィルターの保存に失敗しました' }, { status: 500 })
  }
}
