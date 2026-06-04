// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  try {
    const { db } = await import('@cairn/db')
    const { workspaceInvites, workspaces, profiles } = await import('@cairn/db')
    const { eq, and, or, isNull, gt } = await import('drizzle-orm')

    const now = new Date()
    const [invite] = await db
      .select({
        role: workspaceInvites.role,
        expiresAt: workspaceInvites.expiresAt,
        maxUses: workspaceInvites.maxUses,
        useCount: workspaceInvites.useCount,
        workspaceName: workspaces.name,
        createdByName: profiles.displayName,
      })
      .from(workspaceInvites)
      .innerJoin(workspaces, eq(workspaceInvites.workspaceId, workspaces.id))
      .innerJoin(profiles, eq(workspaceInvites.createdBy, profiles.id))
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

    return NextResponse.json({
      workspaceName: invite.workspaceName,
      createdByName: invite.createdByName,
      role: invite.role,
      expiresAt: invite.expiresAt,
    })
  } catch (err) {
    console.error('[/api/invite/[token]] GET failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
