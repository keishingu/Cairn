// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export interface ProjectMemberDto {
  userId: string
  displayName: string
  avatarUrl: string | null
  role: 'leader' | 'subleader' | 'member' | 'reviewer' | 'observer'
  attendance: 'attending' | 'tentative' | 'declined'
  addedAt: string
}

const MOCK_WS_NAMES: Record<string, string> = {
  m1: '山田 太郎', m2: '佐藤 花子', m3: '鈴木 健',
  m4: '田中 陽子', m5: '伊藤 翔',   m6: '高橋 美咲',
  m7: '中村 拓也', m8: '小林 大地',
}

function mockProjectMembers(): ProjectMemberDto[] {
  return [
    { userId: 'm1', displayName: '山田 太郎', avatarUrl: null, role: 'leader',    attendance: 'attending', addedAt: '2026-01-01' },
    { userId: 'm2', displayName: '佐藤 花子', avatarUrl: null, role: 'subleader', attendance: 'attending', addedAt: '2026-01-05' },
    { userId: 'm3', displayName: '鈴木 健',   avatarUrl: null, role: 'member',    attendance: 'attending', addedAt: '2026-01-10' },
    { userId: 'm4', displayName: '田中 陽子', avatarUrl: null, role: 'member',    attendance: 'attending', addedAt: '2026-01-12' },
    { userId: 'm5', displayName: '伊藤 翔',   avatarUrl: null, role: 'member',    attendance: 'attending', addedAt: '2026-02-01' },
    { userId: 'm6', displayName: '高橋 美咲', avatarUrl: null, role: 'member',    attendance: 'attending', addedAt: '2026-02-14' },
    { userId: 'm8', displayName: '小林 大地', avatarUrl: null, role: 'member',    attendance: 'tentative', addedAt: '2026-04-20' },
  ]
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  if (!process.env['DATABASE_URL']) {
    void projectId
    return NextResponse.json(mockProjectMembers())
  }

  try {
    const { db } = await import('@cairn/db')
    const { profiles, projectMembers, projects, workspaceMembers } = await import('@cairn/db')
    const { eq, and, sql } = await import('drizzle-orm')

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

  if (!process.env['DATABASE_URL']) {
    void projectId
    void ctx
    return NextResponse.json({
      userId,
      displayName: MOCK_WS_NAMES[userId] ?? '不明',
      avatarUrl: null,
      role: (role as ProjectMemberDto['role']),
      attendance: 'attending' as const,
      addedAt: new Date().toISOString().slice(0, 10),
    } satisfies ProjectMemberDto, { status: 201 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { profiles, projectMembers, projects, workspaceMembers } = await import('@cairn/db')
    const { eq, and, sql } = await import('drizzle-orm')

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

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
      .select({
        displayName: profiles.displayName,
        avatarUrl: workspaceMembers.avatarUrl,
      })
      .from(profiles)
      .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
      .where(eq(profiles.id, userId))

    return NextResponse.json({
      userId: inserted.userId,
      displayName: profile?.displayName ?? '',
      avatarUrl: profile?.avatarUrl ?? null,
      role: inserted.role,
      attendance: inserted.attendance,
      addedAt: inserted.addedAt.toISOString().slice(0, 10),
    } satisfies ProjectMemberDto, { status: 201 })
  } catch (err) {
    console.error('[POST /api/projects/[id]/members]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
