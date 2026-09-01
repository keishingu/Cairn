// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { patchProfileAttributesSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { isWorkspaceAdmin } from '@/lib/permissions'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  if (!isWorkspaceAdmin(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = patchProfileAttributesSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '属性の形式が正しくありません' },
      { status: 422 },
    )
  }

  try {
    const { db, workspaceMembers } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')
    const [member] = await db
      .select({ membershipStatus: workspaceMembers.membershipStatus })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)

    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    if (member.membershipStatus !== 'active') {
      return NextResponse.json({ error: '非活性メンバーの属性は変更できません' }, { status: 422 })
    }

    const [updated] = await db
      .update(workspaceMembers)
      .set({ profileAttributes: parsed.data.attributes })
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, userId)))
      .returning({ userId: workspaceMembers.userId, profileAttributes: workspaceMembers.profileAttributes })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[PATCH /api/workspaces/members/[userId]/profile-attributes]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
