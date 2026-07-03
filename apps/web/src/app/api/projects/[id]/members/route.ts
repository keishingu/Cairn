// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireProjectAccess, requireWorkspaceMember } from '@/lib/permissions'
import { createServiceRoleClient, resolveEmailsByUserId } from '@/lib/supabase/service'

export interface ProjectMemberDto {
  userId: string
  displayName: string
  email: string | null
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
    const admin = createServiceRoleClient()
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

    // ゲストは参加プロジェクトのメンバーのみ閲覧可
    const forbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, projectId)
    if (forbidden) return forbidden

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

    const emails = await resolveEmailsByUserId(admin, rows.map(row => row.userId))

    return NextResponse.json(
      rows.map(r => ({
        userId: r.userId,
        displayName: r.displayName,
        email: emails.get(r.userId) ?? null,
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

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const addMemberSchema = z.object({
    userId: z.string().uuid().optional(),
    userIds: z.array(z.string().uuid()).max(50).optional(),
    role: z.enum(['leader', 'subleader', 'member', 'reviewer', 'observer']).default('member'),
  }).refine(d => d.userId !== undefined || (d.userIds?.length ?? 0) > 0, {
    message: 'userId or userIds is required',
  })

  const parsed = addMemberSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }
  const { userId, userIds, role } = parsed.data
  const normalizedUserIds = [...new Set((userIds ?? (userId ? [userId] : [])).filter(Boolean))]

  try {
    const admin = createServiceRoleClient()
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
    const emails = await resolveEmailsByUserId(admin, insertedUserIds)
    const insertedMembers = inserted.map(member => {
      const profile = profileMap.get(member.userId)
      return {
        userId: member.userId,
        displayName: profile?.displayName ?? '',
        email: emails.get(member.userId) ?? null,
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
