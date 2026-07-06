// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/get-auth-context'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { userId, error } = await getAuthUser()
  if (error) return error

  const { token } = await params

  try {
    const { db } = await import('@cairn/db')
    const { workspaceInvites, workspaceMembers, projectMembers } = await import('@cairn/db')
    const { eq, and, or, isNull, gt, sql } = await import('drizzle-orm')
    const { inngest } = await import('@/lib/inngest/client').catch(() => ({ inngest: null }))

    const now = new Date()

    // まず有効な招待かを確認（認可チェック）
    const [invite] = await db
      .select()
      .from(workspaceInvites)
      .where(
        and(
          eq(workspaceInvites.token, token),
          or(isNull(workspaceInvites.expiresAt), gt(workspaceInvites.expiresAt, now)),
        )
      )
      .limit(1)

    if (!invite) {
      return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 })
    }

    // 既にメンバーか確認
    const [existingMembership] = await db
      .select({ id: workspaceMembers.id, membershipStatus: workspaceMembers.membershipStatus })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, invite.workspaceId),
          eq(workspaceMembers.userId, userId),
        )
      )
      .limit(1)

    if (existingMembership?.membershipStatus === 'active') {
      return NextResponse.json({ ok: true, workspaceId: invite.workspaceId })
    }

    // max_uses チェックとインクリメントをアトミックに実行し、
    // 上限未満の場合のみ行が返る → 競合状態を防ぐ
    const [claimed] = await db
      .update(workspaceInvites)
      .set({ useCount: sql`${workspaceInvites.useCount} + 1` })
      .where(
        and(
          eq(workspaceInvites.id, invite.id),
          or(isNull(workspaceInvites.expiresAt), gt(workspaceInvites.expiresAt, sql`now()`)),
          or(
            isNull(workspaceInvites.maxUses),
            sql`${workspaceInvites.useCount} < ${workspaceInvites.maxUses}`,
          ),
        )
      )
      .returning({
        id: workspaceInvites.id,
        workspaceId: workspaceInvites.workspaceId,
        role: workspaceInvites.role,
        projectId: workspaceInvites.projectId,
      })

    if (!claimed) {
      return NextResponse.json({ error: 'Invite link has reached its usage limit' }, { status: 410 })
    }

    if (existingMembership) {
      await db
        .update(workspaceMembers)
        .set({ membershipStatus: 'active' })
        .where(eq(workspaceMembers.id, existingMembership.id))
    } else {
      await db.insert(workspaceMembers).values({
        workspaceId: claimed.workspaceId,
        userId: userId,
        role: claimed.role,
      })
    }

    // ゲスト招待にプロジェクトが紐付いている場合、プロジェクトメンバーにも自動追加
    if (claimed.projectId) {
      await db
        .insert(projectMembers)
        .values({
          projectId: claimed.projectId,
          userId,
          role: 'member',
          attendance: 'attending',
        })
        .onConflictDoNothing()
    }

    if (inngest) {
      await inngest.send({
        name: 'member/upserted',
        data: { userId: userId, workspaceId: claimed.workspaceId },
      }).catch(e => console.warn('[/api/invite/[token]/accept] Inngest event send failed:', e))
    }

    return NextResponse.json({ ok: true, workspaceId: claimed.workspaceId })
  } catch (err) {
    console.error('[/api/invite/[token]/accept] POST failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
