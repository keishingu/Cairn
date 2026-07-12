// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  try {
    const { db } = await import('@cairn/db')
    const { workspaceInvites, workspaces, profiles, projects, workspaceMembers } = await import('@cairn/db')
    const { eq, and, or, isNull, gt } = await import('drizzle-orm')

    const now = new Date()

    const [invite] = await db
      .select({
        role: workspaceInvites.role,
        expiresAt: workspaceInvites.expiresAt,
        maxUses: workspaceInvites.maxUses,
        useCount: workspaceInvites.useCount,
        projectId: workspaceInvites.projectId,
        workspaceName: workspaces.name,
        createdByName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
      })
      .from(workspaceInvites)
      .innerJoin(workspaces, eq(workspaceInvites.workspaceId, workspaces.id))
      .innerJoin(profiles, eq(workspaceInvites.createdBy, profiles.id))
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, workspaceInvites.workspaceId),
          eq(workspaceMembers.userId, workspaceInvites.createdBy),
        ),
      )
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

    let projectName: string | null = null
    if (invite.projectId) {
      const [project] = await db
        .select({ title: projects.title })
        .from(projects)
        .where(eq(projects.id, invite.projectId))
        .limit(1)
      projectName = project?.title ?? null
    }

    return NextResponse.json({
      workspaceName: invite.workspaceName,
      createdByName: invite.createdByName,
      role: invite.role,
      expiresAt: invite.expiresAt,
      projectName,
    })
  } catch (err) {
    console.error('[/api/invite/[token]] GET failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
