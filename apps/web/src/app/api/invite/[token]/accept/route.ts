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

    // 既存メンバーか確認。非活性（卒業生）なら招待受け入れで再活性化し、同一性・履歴のまま復帰させる。
    // 既に活性なら何もしない。いずれも招待の消費（useCount 加算）は行わない（復帰扱いのため）。
    const { reactivateViaInvite } = await import('@/lib/access/lifecycle')
    const membershipState = await reactivateViaInvite(invite.workspaceId, userId)
    if (membershipState !== 'none') {
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

    await db.insert(workspaceMembers).values({
      workspaceId: claimed.workspaceId,
      userId: userId,
      role: claimed.role,
    })

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
