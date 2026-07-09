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
    const { workspaceInvites, workspaceMembers, projectMembers, channelMembers, channels, projects } = await import('@cairn/db')
    const { eq, and, or, isNull, gt, sql, inArray } = await import('drizzle-orm')
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

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`
        select 1
        from workspace_members
        where workspace_id = ${invite.workspaceId}
          and user_id = ${userId}
        for update
      `)

      // 既に active なメンバーはべき等に成功させ、use_count を増やさない。inactive の復帰は
      // membership 行をロックして再確認した後に claim し、復帰後のロール・プロジェクトも招待リンクに揃える。
      const [existingMembership] = await tx
        .select({ membershipStatus: workspaceMembers.membershipStatus })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, invite.workspaceId), eq(workspaceMembers.userId, userId)))
        .limit(1)

      if (existingMembership?.membershipStatus === 'active') {
        return { ok: true as const, workspaceId: invite.workspaceId, shouldIndexMember: false }
      }

      // max_uses チェックとインクリメントをアトミックに実行し、
      // 上限未満の場合のみ行が返る → 競合状態を防ぐ
      const [claimed] = await tx
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
        return { ok: false as const, status: 410, error: 'Invite link has reached its usage limit' }
      }

      if (existingMembership?.membershipStatus === 'inactive') {
        await tx
          .update(workspaceMembers)
          .set({ membershipStatus: 'active', deactivatedAt: null, deactivatedBy: null, role: claimed.role })
          .where(and(eq(workspaceMembers.workspaceId, claimed.workspaceId), eq(workspaceMembers.userId, userId)))

        // guest 復帰では、履歴保持のために残っていた旧 project/channel 所属を
        // 認可に再利用させない。招待リンクが表す project scope だけを下で再付与する。
        if (claimed.role === 'guest') {
          const scopedProjects = await tx
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.workspaceId, claimed.workspaceId))
          const projectIds = scopedProjects.map(p => p.id)
          if (projectIds.length > 0) {
            await tx
              .delete(projectMembers)
              .where(and(eq(projectMembers.userId, userId), inArray(projectMembers.projectId, projectIds)))
          }

          const scopedChannels = await tx
            .select({ id: channels.id })
            .from(channels)
            .leftJoin(projects, eq(channels.projectId, projects.id))
            .where(sql`coalesce(${channels.workspaceId}, ${projects.workspaceId}) = ${claimed.workspaceId}`)
          const channelIds = scopedChannels.map(c => c.id)
          if (channelIds.length > 0) {
            await tx
              .delete(channelMembers)
              .where(and(eq(channelMembers.userId, userId), inArray(channelMembers.channelId, channelIds)))
          }
        }
      } else {
        await tx.insert(workspaceMembers).values({
          workspaceId: claimed.workspaceId,
          userId: userId,
          role: claimed.role,
        })
      }

      // ゲスト招待にプロジェクトが紐付いている場合、プロジェクトメンバーにも自動追加
      if (claimed.projectId) {
        await tx
          .insert(projectMembers)
          .values({
            projectId: claimed.projectId,
            userId,
            role: 'member',
            attendance: 'attending',
          })
          .onConflictDoNothing()
      }

      return { ok: true as const, workspaceId: claimed.workspaceId, shouldIndexMember: true }
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    if (result.shouldIndexMember && inngest) {
      await inngest.send({
        name: 'member/upserted',
        data: { userId: userId, workspaceId: result.workspaceId },
      }).catch(e => console.warn('[/api/invite/[token]/accept] Inngest event send failed:', e))
    }

    return NextResponse.json({ ok: true, workspaceId: result.workspaceId })
  } catch (err) {
    console.error('[/api/invite/[token]/accept] POST failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
