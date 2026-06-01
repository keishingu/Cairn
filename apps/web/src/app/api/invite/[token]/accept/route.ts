// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const { token } = await params

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json({ ok: true })
  }

  try {
    const { db } = await import('@cairn/db')
    const { workspaceInvites, workspaceMembers } = await import('@cairn/db')
    const { eq, and, or, isNull, gt } = await import('drizzle-orm')

    const now = new Date()
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

    if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
      return NextResponse.json({ error: 'Invite link has reached its usage limit' }, { status: 410 })
    }

    const existingMembership = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, invite.workspaceId),
          eq(workspaceMembers.userId, ctx.userId),
        )
      )
      .limit(1)

    if (existingMembership.length === 0) {
      await db.insert(workspaceMembers).values({
        workspaceId: invite.workspaceId,
        userId: ctx.userId,
        role: invite.role,
      })

      await db
        .update(workspaceInvites)
        .set({ useCount: invite.useCount + 1 })
        .where(eq(workspaceInvites.id, invite.id))

      try {
        const { inngest } = await import('@/lib/inngest/client')
        await inngest.send({
          name: 'member/upserted',
          data: { userId: ctx.userId, workspaceId: invite.workspaceId },
        })
      } catch (e) {
        console.warn('[/api/invite/[token]/accept] Inngest event send failed:', e)
      }
    }

    return NextResponse.json({ ok: true, workspaceId: invite.workspaceId })
  } catch (err) {
    console.error('[/api/invite/[token]/accept] POST failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
