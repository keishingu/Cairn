// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { createProfileAttributeSchema } from '@cairn/shared'
import type { ProfileAttributeColor, ProfileAttributeDto } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, workspaceProfileAttributes } = await import('@cairn/db')
    const { asc, eq } = await import('drizzle-orm')
    const rows = await db
      .select({
        id: workspaceProfileAttributes.id,
        name: workspaceProfileAttributes.name,
        color: workspaceProfileAttributes.color,
      })
      .from(workspaceProfileAttributes)
      .where(eq(workspaceProfileAttributes.workspaceId, ctx.workspaceId))
      .orderBy(asc(workspaceProfileAttributes.createdAt), asc(workspaceProfileAttributes.name))

    return NextResponse.json(rows.map(row => ({
      ...row,
      color: row.color as ProfileAttributeColor,
    })) satisfies ProfileAttributeDto[])
  } catch (err) {
    console.error('[GET /api/workspaces/profile-attributes]', err)
    return NextResponse.json({ error: '属性を取得できませんでした' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const forbidden = requireRole(ctx.role, 'admin')
  if (forbidden) return forbidden

  const parsed = createProfileAttributeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '属性の形式が正しくありません' },
      { status: 422 },
    )
  }

  try {
    const { db, workspaceProfileAttributes } = await import('@cairn/db')
    const [created] = await db
      .insert(workspaceProfileAttributes)
      .values({ workspaceId: ctx.workspaceId, ...parsed.data })
      .returning({
        id: workspaceProfileAttributes.id,
        name: workspaceProfileAttributes.name,
        color: workspaceProfileAttributes.color,
      })
    if (!created) throw new Error('Insert returned no rows')
    return NextResponse.json({
      ...created,
      color: created.color as ProfileAttributeColor,
    } satisfies ProfileAttributeDto, { status: 201 })
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === '23505') {
      return NextResponse.json({ error: '同じ名前の属性がすでにあります' }, { status: 409 })
    }
    console.error('[POST /api/workspaces/profile-attributes]', err)
    return NextResponse.json({ error: '属性を追加できませんでした' }, { status: 500 })
  }
}
