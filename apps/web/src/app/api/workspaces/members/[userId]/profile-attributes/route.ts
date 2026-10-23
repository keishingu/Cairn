// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { patchProfileAttributesSchema } from '@cairn/shared'
import type { ProfileAttributeColor, ProfileAttributeDto } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const forbidden = requireRole(ctx.role, 'admin')
  if (forbidden) return forbidden

  const parsed = patchProfileAttributesSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '属性の形式が正しくありません' },
      { status: 422 },
    )
  }

  try {
    const {
      db,
      workspaceMembers,
      workspaceMemberProfileAttributes,
      workspaceProfileAttributes,
    } = await import('@cairn/db')
    const { and, eq, inArray } = await import('drizzle-orm')

    const result = await db.transaction(async tx => {
      const [member] = await tx
        .select({ id: workspaceMembers.id, membershipStatus: workspaceMembers.membershipStatus })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, userId)))
        .limit(1)

      if (!member) return { ok: false as const, error: 'Member not found', status: 404 as const }
      if (member.membershipStatus !== 'active') {
        return { ok: false as const, error: '非活性メンバーの属性は変更できません', status: 422 as const }
      }

      const selected = parsed.data.attributeIds.length > 0
        ? await tx
            .select({
              id: workspaceProfileAttributes.id,
              name: workspaceProfileAttributes.name,
              color: workspaceProfileAttributes.color,
            })
            .from(workspaceProfileAttributes)
            .where(and(
              eq(workspaceProfileAttributes.workspaceId, ctx.workspaceId),
              inArray(workspaceProfileAttributes.id, parsed.data.attributeIds),
            ))
        : []
      if (selected.length !== parsed.data.attributeIds.length) {
        return { ok: false as const, error: '選択した属性が見つかりません', status: 422 as const }
      }

      const byId = new Map(selected.map(attribute => [attribute.id, attribute]))
      const profileAttributes: ProfileAttributeDto[] = parsed.data.attributeIds.map(id => {
        const attribute = byId.get(id)!
        return { id, name: attribute.name, color: attribute.color as ProfileAttributeColor }
      })

      await tx
        .delete(workspaceMemberProfileAttributes)
        .where(eq(workspaceMemberProfileAttributes.workspaceMemberId, member.id))
      if (profileAttributes.length > 0) {
        await tx.insert(workspaceMemberProfileAttributes).values(
          profileAttributes.map(attribute => ({
            workspaceMemberId: member.id,
            profileAttributeId: attribute.id,
          })),
        )
      }
      // 旧バージョンが新DBで短時間動いても名称表示を維持できるよう、旧JSON列も同期する。
      await tx
        .update(workspaceMembers)
        .set({ profileAttributes: profileAttributes.map(attribute => attribute.name) })
        .where(eq(workspaceMembers.id, member.id))

      return { ok: true as const, userId, profileAttributes }
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ userId: result.userId, profileAttributes: result.profileAttributes })
  } catch (err) {
    console.error('[PATCH /api/workspaces/members/[userId]/profile-attributes]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
