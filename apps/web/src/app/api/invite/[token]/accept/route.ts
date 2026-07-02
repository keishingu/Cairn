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
    const { workspaceInvites, workspaceMembers, projectMembers, projects, channelMembers, channels, notifications } = await import('@cairn/db')
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

    if (existingMembership) {
      if (existingMembership.membershipStatus === 'active') {
        return NextResponse.json({ ok: true, workspaceId: invite.workspaceId })
      }
    }

    const claimed = await db.transaction(async (tx) => {
      // max_uses チェックとインクリメントをアトミックに実行し、
      // 後続の再有効化や掃除も同一 transaction に含めて中途半端な権限復元を防ぐ
      const [claimedInvite] = await tx
        .update(workspaceInvites)
        .set({ useCount: sql`${workspaceInvites.useCount} + 1` })
        .where(
          and(
            eq(workspaceInvites.id, invite.id),
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

      if (!claimedInvite) {
        return null
      }

      if (existingMembership) {
        await tx
          .update(workspaceMembers)
          .set({ membershipStatus: 'active', role: claimedInvite.role })
          .where(eq(workspaceMembers.id, existingMembership.id))

        if (claimedInvite.role === 'guest') {
          const workspaceProjectIds = (await tx
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.workspaceId, claimedInvite.workspaceId))
          ).map(project => project.id)
          const workspaceChannelIds = (await tx
            .select({ id: channels.id })
            .from(channels)
            .leftJoin(projects, eq(channels.projectId, projects.id))
            .where(sql`coalesce(${channels.workspaceId}, ${projects.workspaceId}) = ${claimedInvite.workspaceId}`)
          ).map(channel => channel.id)

          if (workspaceProjectIds.length > 0) {
            await tx
              .delete(projectMembers)
              .where(and(
                eq(projectMembers.userId, userId),
                inArray(projectMembers.projectId, workspaceProjectIds),
              ))
          }

          if (workspaceChannelIds.length > 0) {
            await tx
              .delete(channelMembers)
              .where(and(
                eq(channelMembers.userId, userId),
                inArray(channelMembers.channelId, workspaceChannelIds),
              ))
          }

          await tx
            .delete(notifications)
            .where(and(
              eq(notifications.userId, userId),
              eq(notifications.workspaceId, claimedInvite.workspaceId),
            ))
        }
      } else {
        await tx.insert(workspaceMembers).values({
          workspaceId: claimedInvite.workspaceId,
          userId: userId,
          role: claimedInvite.role,
        })
      }

      // ゲスト招待にプロジェクトが紐付いている場合、再有効化と同じ transaction で付け直す
      if (claimedInvite.projectId) {
        await tx
          .insert(projectMembers)
          .values({
            projectId: claimedInvite.projectId,
            userId,
            role: 'member',
            attendance: 'attending',
          })
          .onConflictDoNothing()
      }

      return claimedInvite
    })

    if (!claimed) {
      return NextResponse.json({ error: 'Invite link has reached its usage limit' }, { status: 410 })
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
