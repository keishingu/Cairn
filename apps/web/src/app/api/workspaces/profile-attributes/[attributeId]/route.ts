// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { patchProfileAttributeSchema } from '@cairn/shared'
import type { ProfileAttributeColor, ProfileAttributeDto } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'

type RouteParams = { params: Promise<{ attributeId: string }> }

export async function PATCH(req: Request, { params }: RouteParams) {
  const { attributeId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const forbidden = requireRole(ctx.role, 'admin')
  if (forbidden) return forbidden

  const parsed = patchProfileAttributeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '属性の形式が正しくありません' },
      { status: 422 },
    )
  }

  try {
    const { db, workspaceMembers, workspaceProfileAttributes } = await import('@cairn/db')
    const { and, eq, sql } = await import('drizzle-orm')
    const result = await db.transaction(async tx => {
      const [existing] = await tx
        .select({ name: workspaceProfileAttributes.name })
        .from(workspaceProfileAttributes)
        .where(and(
          eq(workspaceProfileAttributes.id, attributeId),
          eq(workspaceProfileAttributes.workspaceId, ctx.workspaceId),
        ))
        .limit(1)
      if (!existing) return null

      const [updated] = await tx
        .update(workspaceProfileAttributes)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(
          eq(workspaceProfileAttributes.id, attributeId),
          eq(workspaceProfileAttributes.workspaceId, ctx.workspaceId),
        ))
        .returning({
          id: workspaceProfileAttributes.id,
          name: workspaceProfileAttributes.name,
          color: workspaceProfileAttributes.color,
        })
      if (!updated) return null

      if (parsed.data.name && parsed.data.name !== existing.name) {
        await tx
          .update(workspaceMembers)
          .set({
            profileAttributes: sql`(
              select coalesce(
                jsonb_agg(case when value = ${existing.name} then ${parsed.data.name} else value end),
                '[]'::jsonb
              )
              from jsonb_array_elements_text(${workspaceMembers.profileAttributes}) as attribute(value)
            )`,
          })
          .where(and(
            eq(workspaceMembers.workspaceId, ctx.workspaceId),
            sql`${workspaceMembers.profileAttributes} ? ${existing.name}`,
          ))
      }
      return updated
    })
    if (!result) return NextResponse.json({ error: '属性が見つかりません' }, { status: 404 })
    return NextResponse.json({
      ...result,
      color: result.color as ProfileAttributeColor,
    } satisfies ProfileAttributeDto)
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === '23505') {
      return NextResponse.json({ error: '同じ名前の属性がすでにあります' }, { status: 409 })
    }
    console.error('[PATCH /api/workspaces/profile-attributes/[attributeId]]', err)
    return NextResponse.json({ error: '属性を更新できませんでした' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { attributeId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const forbidden = requireRole(ctx.role, 'admin')
  if (forbidden) return forbidden

  try {
    const { db, workspaceMembers, workspaceProfileAttributes } = await import('@cairn/db')
    const { and, eq, sql } = await import('drizzle-orm')
    const deleted = await db.transaction(async tx => {
      const [attribute] = await tx
        .delete(workspaceProfileAttributes)
        .where(and(
          eq(workspaceProfileAttributes.id, attributeId),
          eq(workspaceProfileAttributes.workspaceId, ctx.workspaceId),
        ))
        .returning({ id: workspaceProfileAttributes.id, name: workspaceProfileAttributes.name })
      if (!attribute) return null

      await tx
        .update(workspaceMembers)
        .set({ profileAttributes: sql`${workspaceMembers.profileAttributes} - ${attribute.name}` })
        .where(eq(workspaceMembers.workspaceId, ctx.workspaceId))
      return attribute
    })
    if (!deleted) return NextResponse.json({ error: '属性が見つかりません' }, { status: 404 })
    return NextResponse.json({ id: deleted.id })
  } catch (err) {
    console.error('[DELETE /api/workspaces/profile-attributes/[attributeId]]', err)
    return NextResponse.json({ error: '属性を削除できませんでした' }, { status: 500 })
  }
}
