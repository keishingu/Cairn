// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireProjectManager } from '@/lib/permissions'

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

  const { userId, role = 'member' } = body as { userId?: string; role?: string }
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 422 })
  }

  const validRoles = ['leader', 'subleader', 'member', 'reviewer', 'observer']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 422 })
  }

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

    const forbidden = await requireProjectManager(projectId, ctx.userId, ctx.workspaceId)
    if (forbidden) return forbidden

    const [wsMember] = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, userId)))

    if (!wsMember) {
      return NextResponse.json({ error: 'User is not a workspace member' }, { status: 422 })
    }

    const [inserted] = await db
      .insert(projectMembers)
      .values({
        projectId,
        userId,
        role: (role as ProjectMemberDto['role']),
        attendance: 'attending',
      })
      .onConflictDoNothing()
      .returning({
        userId: projectMembers.userId,
        role: projectMembers.role,
        attendance: projectMembers.attendance,
        addedAt: projectMembers.createdAt,
      })

    if (!inserted) {
      return NextResponse.json({ error: 'Member already exists' }, { status: 409 })
    }

    const [profile] = await db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, userId))

    return NextResponse.json({
      userId: inserted.userId,
      displayName: profile?.displayName ?? '',
      avatarUrl: null,
      role: inserted.role,
      attendance: inserted.attendance,
      addedAt: inserted.addedAt.toISOString().slice(0, 10),
    } satisfies ProjectMemberDto, { status: 201 })
  } catch (err) {
    console.error('[POST /api/projects/[id]/members]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
