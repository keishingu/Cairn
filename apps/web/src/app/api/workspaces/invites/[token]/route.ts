// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const { token } = await params

  try {
    const { db } = await import('@cairn/db')
    const { workspaceInvites, workspaceMembers } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    // 招待の作成者 or owner/admin のみ削除可能
    const [[invite], [caller]] = await Promise.all([
      db
        .select({ createdBy: workspaceInvites.createdBy })
        .from(workspaceInvites)
        .where(and(eq(workspaceInvites.token, token), eq(workspaceInvites.workspaceId, ctx.workspaceId)))
        .limit(1),
      db
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, ctx.userId)))
        .limit(1),
    ])

    if (!invite) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const isAdminOrOwner = caller && (caller.role === 'owner' || caller.role === 'admin')
    const isCreator = invite.createdBy === ctx.userId

    if (!isCreator && !isAdminOrOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await db
      .delete(workspaceInvites)
      .where(and(eq(workspaceInvites.token, token), eq(workspaceInvites.workspaceId, ctx.workspaceId)))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/workspaces/invites/[token]] DELETE failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
