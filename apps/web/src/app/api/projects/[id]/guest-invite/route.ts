// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'
import { runForActiveMembership } from '@/lib/access/active-membership-lock'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const forbidden = requireRole(ctx.role, 'admin')
  if (forbidden) return forbidden

  try {
    const { db } = await import('@cairn/db')
    const { workspaceInvites, projects } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')
    const { randomUUID } = await import('crypto')

    const token = randomUUID()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30日

    const result = await runForActiveMembership(db, ctx.workspaceId, ctx.userId, async (tx) => {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      if (!project) return { invite: null }

      const [invite] = await tx
        .insert(workspaceInvites)
        .values({
          workspaceId: ctx.workspaceId,
          token,
          createdBy: ctx.userId,
          expiresAt,
          role: 'guest',
          projectId,
        })
        .returning()
      return { invite: invite! }
    })
    if (!result) {
      return NextResponse.json(
        { error: 'ワークスペースへのアクセス権がありません' },
        { status: 403 },
      )
    }
    if (!result.invite) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    const invite = result.invite

    const origin = new URL(req.url).origin
    return NextResponse.json({
      token: invite.token,
      url: `${origin}/invite/${invite.token}`,
      expiresAt: invite.expiresAt,
    })
  } catch (err) {
    console.error('[POST /api/projects/[id]/guest-invite]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
