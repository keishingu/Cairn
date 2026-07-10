// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import type { MilestoneDto } from '../projects/[id]/milestones/route'

export interface WorkspaceMilestoneDto extends MilestoneDto {
  projectTitle: string
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, activeWorkspaceMembers, channels, milestones, projectMembers, projects } = await import('@cairn/db')
    const { and, eq, inArray, sql } = await import('drizzle-orm')

    const [wsMember] = await db
      .select({ role: activeWorkspaceMembers.role })
      .from(activeWorkspaceMembers)
      .where(and(eq(activeWorkspaceMembers.workspaceId, ctx.workspaceId), eq(activeWorkspaceMembers.userId, ctx.userId)))
      .limit(1)

    const isGuest = wsMember?.role === 'guest'
    let visibleProjectIds: string[] | null = null
    if (isGuest) {
      const memberRows = await db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .innerJoin(projects, eq(projectMembers.projectId, projects.id))
        .where(and(eq(projectMembers.userId, ctx.userId), eq(projects.workspaceId, ctx.workspaceId)))
      visibleProjectIds = memberRows.map(r => r.projectId)
      if (visibleProjectIds.length === 0) return NextResponse.json([])
    }

    const rows = await db
      .select({
        id: milestones.id,
        projectId: milestones.projectId,
        projectTitle: projects.title,
        title: milestones.title,
        description: milestones.description,
        startDate: milestones.startDate,
        endDate: milestones.endDate,
        startTime: milestones.startTime,
        endTime: milestones.endTime,
        completed: milestones.completed,
        channelId: channels.id,
      })
      .from(milestones)
      .innerJoin(projects, eq(milestones.projectId, projects.id))
      .innerJoin(channels, eq(channels.milestoneId, milestones.id))
      .where(
        and(
          eq(projects.workspaceId, ctx.workspaceId),
          visibleProjectIds ? inArray(projects.id, visibleProjectIds) : undefined,
        ),
      )
      .orderBy(projects.createdAt, sql`${milestones.startDate} asc nulls last`, milestones.createdAt)

    return NextResponse.json(rows satisfies WorkspaceMilestoneDto[])
  } catch (err) {
    console.error('[/api/milestones GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
