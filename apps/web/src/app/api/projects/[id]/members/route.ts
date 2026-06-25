// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireWorkspaceMember } from '@/lib/permissions'

export interface ProjectMemberDto {
  userId: string
  displayName: string
  avatarUrl: string | null
  role: 'leader' | 'subleader' | 'member' | 'reviewer' | 'observer'
  attendance: 'attending' | 'tentative' | 'declined'
  addedAt: string
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db } = await import('@cairn/db')
    const { profiles, projectMembers, projects, workspaceMembers } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const rows = await db
      .select({
        userId: profiles.id,
        displayName: profiles.displayName,
        avatarUrl: workspaceMembers.avatarUrl,
        role: projectMembers.role,
        attendance: projectMembers.attendance,
        addedAt: projectMembers.createdAt,
      })
      .from(projectMembers)
      .innerJoin(profiles, eq(projectMembers.userId, profiles.id))
      .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
      .where(eq(projectMembers.projectId, projectId))
      .orderBy(profiles.displayName)

    return NextResponse.json(
      rows.map(r => ({
        userId: r.userId,
        displayName: r.displayName,
        avatarUrl: r.avatarUrl ?? null,
        role: r.role,
        attendance: r.attendance,
        addedAt: r.addedAt.toISOString().slice(0, 10),
      } satisfies ProjectMemberDto)),
    )
  } catch (err) {
    console.error('[GET /api/projects/[id]/members]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { userId, userIds, role = 'member' } = body as { userId?: string; userIds?: string[]; role?: string }
  if (userIds !== undefined && !Array.isArray(userIds)) {
    return NextResponse.json({ error: 'userIds must be an array' }, { status: 422 })
  }
  if (userIds?.some(candidate => typeof candidate !== 'string' || candidate.length === 0)) {
    return NextResponse.json({ error: 'userIds must contain only non-empty strings' }, { status: 422 })
  }
  const normalizedUserIds = [...new Set((userIds ?? (userId ? [userId] : [])).filter(Boolean))]
  if (normalizedUserIds.length === 0) {
    return NextResponse.json({ error: 'userId or userIds is required' }, { status: 422 })
  }

  const validRoles = ['leader', 'subleader', 'member', 'reviewer', 'observer']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 422 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { profiles, projectMembers, projects, workspaceMembers } = await import('@cairn/db')
    const { eq, and, inArray } = await import('drizzle-orm')

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const forbidden = await requireWorkspaceMember(ctx.workspaceId, ctx.userId)
    if (forbidden) return forbidden

    const wsMembers = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), inArray(workspaceMembers.userId, normalizedUserIds)))

    if (wsMembers.length !== normalizedUserIds.length) {
      return NextResponse.json({ error: 'User is not a workspace member' }, { status: 422 })
    }

    const inserted = await db
      .insert(projectMembers)
      .values(
        normalizedUserIds.map(targetUserId => ({
          projectId,
          userId: targetUserId,
          role: (role as ProjectMemberDto['role']),
          attendance: 'attending' as const,
        })),
      )
      .onConflictDoNothing()
      .returning({
        userId: projectMembers.userId,
        role: projectMembers.role,
        attendance: projectMembers.attendance,
        addedAt: projectMembers.createdAt,
      })

    if (inserted.length === 0) {
      return NextResponse.json({ error: 'Member already exists' }, { status: 409 })
    }

    const insertedUserIds = inserted.map(member => member.userId)
    const profileRows = await db
      .select({
        userId: profiles.id,
        displayName: profiles.displayName,
        avatarUrl: workspaceMembers.avatarUrl,
      })
      .from(profiles)
      .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
      .where(inArray(profiles.id, insertedUserIds))

    const profileMap = new Map(profileRows.map(profile => [profile.userId, profile]))
    const insertedMembers = inserted.map(member => {
      const profile = profileMap.get(member.userId)
      return {
        userId: member.userId,
        displayName: profile?.displayName ?? '',
        avatarUrl: profile?.avatarUrl ?? null,
        role: member.role,
        attendance: member.attendance,
        addedAt: member.addedAt.toISOString().slice(0, 10),
      } satisfies ProjectMemberDto
    })

    try {
      const { inngest } = await import('@/lib/inngest/client')
      await inngest.send({
        name: 'project/upserted',
        data: { projectId, workspaceId: ctx.workspaceId },
      })
    } catch (eventError) {
      console.warn('[POST /api/projects/[id]/members] Inngest event send failed (indexing skipped):', eventError)
    }

    return NextResponse.json(
      normalizedUserIds.length === 1 ? insertedMembers[0] : insertedMembers,
      { status: 201 },
    )
  } catch (err) {
    console.error('[POST /api/projects/[id]/members]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
